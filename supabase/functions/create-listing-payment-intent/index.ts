import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LOG = "[create-listing-payment-intent]";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Listing = {
  id: string;
  title: string;
  price_chf: number;
  seller_id: string;
};

async function handleInstant(opts: {
  stripeKey: string;
  supabase: ReturnType<typeof createClient>;
  buyerId: string;
  listing: Listing;
  amountRappen: number;
}) {
  const { stripeKey, supabase, buyerId, listing, amountRappen } = opts;

  const { data: profile, error: selectErr } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", buyerId)
    .maybeSingle();

  if (selectErr) {
    console.error(`${LOG} profile select failed`, selectErr.message);
    return jsonResponse({ error: selectErr.message }, 500);
  }

  const customerId = profile?.stripe_customer_id;
  if (!customerId) {
    return jsonResponse({ error: "no_payment_method" }, 400);
  }

  const methodsRes = await fetch(
    `https://api.stripe.com/v1/payment_methods?customer=${encodeURIComponent(customerId)}&type=card`,
    {
      method: "GET",
      headers: { "Authorization": `Bearer ${stripeKey}` },
    }
  );
  const methodsJson = await methodsRes.json();

  if (!methodsRes.ok || methodsJson.error) {
    const message = methodsJson.error?.message ?? "stripe_error";
    console.error(`${LOG} list payment methods failed`, message);
    return jsonResponse({ error: message }, 502);
  }

  const methods = (methodsJson.data ?? []) as Array<{ id: string }>;
  if (methods.length === 0) {
    return jsonResponse({ error: "no_payment_method" }, 400);
  }

  const paymentMethodId = methods[0].id;

  const params = new URLSearchParams();
  params.set("amount", String(amountRappen));
  params.set("currency", "chf");
  params.set("customer", customerId);
  params.set("payment_method", paymentMethodId);
  params.set("off_session", "true");
  params.set("confirm", "true");
  params.set("metadata[listing_id]", listing.id);
  params.set("metadata[buyer_id]", buyerId);
  params.set("metadata[seller_id]", listing.seller_id);
  params.set("metadata[amount_chf]", String(listing.price_chf));
  params.set("metadata[type]", "listing");

  const intentRes = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const intent = await intentRes.json();

  if (intent.error) {
    const message = intent.error.message ?? "stripe_error";
    console.error(`${LOG} payment intent error`, message);
    return jsonResponse({ status: "failed", error: message });
  }

  if (intent.status === "succeeded") {
    return jsonResponse({ status: "succeeded", payment_intent_id: intent.id });
  }

  if (intent.status === "requires_action") {
    return jsonResponse({
      status: "requires_action",
      client_secret: intent.client_secret,
    });
  }

  console.error(`${LOG} unexpected intent status`, intent.status);
  return jsonResponse({ status: "failed", error: `unexpected_status:${intent.status}` });
}

async function handleCheckout(opts: {
  stripeKey: string;
  buyerId: string;
  listing: Listing;
  amountRappen: number;
}) {
  const { stripeKey, buyerId, listing, amountRappen } = opts;

  const params = new URLSearchParams({
    "payment_method_types[]": "card",
    "line_items[0][price_data][currency]": "chf",
    "line_items[0][price_data][unit_amount]": String(amountRappen),
    "line_items[0][price_data][product_data][name]": listing.title,
    "line_items[0][quantity]": "1",
    "mode": "payment",
    "success_url": `clickk://payment-success?session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `clickk://payment-cancel`,
    "metadata[listing_id]": listing.id,
    "metadata[buyer_id]": buyerId,
    "metadata[seller_id]": listing.seller_id,
    "metadata[amount_chf]": String(listing.price_chf),
    "metadata[type]": "listing",
  });

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const session = await stripeRes.json();

  if (session.error) {
    const message = session.error.message ?? "stripe_error";
    console.error(`${LOG} checkout session error`, message);
    throw new Error(message);
  }

  return jsonResponse({ checkoutUrl: session.url, sessionId: session.id });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error(`${LOG} missing authorization header`);
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    let buyerId: string | undefined;
    try {
      const payload = JSON.parse(atob(token.split(".")[1])) as { sub?: string };
      buyerId = payload.sub;
    } catch (err) {
      console.error(`${LOG} failed to parse jwt`, err);
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (!buyerId) {
      console.error(`${LOG} jwt missing sub`);
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const { listing_id, mode } = await req.json();

    if (!listing_id || typeof listing_id !== "string") {
      return jsonResponse({ error: "invalid_params" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: listing, error: listingError } = await supabase
      .from("shop_listings")
      .select("id, title, price_chf, stock, is_active, seller_id")
      .eq("id", listing_id)
      .maybeSingle();

    if (listingError) {
      console.error(`${LOG} listing select failed`, listingError.message);
      return jsonResponse({ error: listingError.message }, 500);
    }

    if (!listing) {
      return jsonResponse({ error: "listing_not_found" }, 404);
    }

    if (!listing.is_active) {
      return jsonResponse({ error: "listing_not_active" }, 400);
    }

    if (listing.stock <= 0) {
      return jsonResponse({ error: "out_of_stock" }, 400);
    }

    if (listing.seller_id === buyerId) {
      return jsonResponse({ error: "cannot_buy_own_listing" }, 403);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error(`${LOG} STRIPE_SECRET_KEY not configured`);
      throw new Error("stripe_not_configured");
    }

    const amountRappen = Math.round(listing.price_chf * 100);
    const resolvedMode: "instant" | "checkout" = mode === "instant" ? "instant" : "checkout";

    const listingForHandler: Listing = {
      id: listing.id,
      title: listing.title,
      price_chf: listing.price_chf,
      seller_id: listing.seller_id,
    };

    if (resolvedMode === "instant") {
      return await handleInstant({
        stripeKey,
        supabase,
        buyerId,
        listing: listingForHandler,
        amountRappen,
      });
    }

    return await handleCheckout({
      stripeKey,
      buyerId,
      listing: listingForHandler,
      amountRappen,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    console.error(`${LOG} unexpected error`, message);
    return jsonResponse({ error: message }, 500);
  }
});
