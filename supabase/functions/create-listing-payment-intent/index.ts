import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    let buyer_id: string | undefined;
    try {
      const payload = JSON.parse(atob(token.split(".")[1])) as { sub?: string };
      buyer_id = payload.sub;
    } catch {
      // invalid token
    }

    if (!buyer_id) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { listing_id } = await req.json();

    if (!listing_id || typeof listing_id !== "string") {
      return new Response(
        JSON.stringify({ error: "invalid_params" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: listing, error: listingError } = await supabase
      .from("shop_listings")
      .select("id, title, price_chf, stock, is_active, seller_id")
      .eq("id", listing_id)
      .single();

    if (listingError || !listing) {
      return new Response(
        JSON.stringify({ error: "listing_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!listing.is_active) {
      return new Response(
        JSON.stringify({ error: "listing_not_active" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (listing.stock <= 0) {
      return new Response(
        JSON.stringify({ error: "out_of_stock" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (listing.seller_id === buyer_id) {
      return new Response(
        JSON.stringify({ error: "cannot_buy_own_listing" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("stripe_not_configured");

    const amountRappen = Math.round(listing.price_chf * 100);

    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "line_items[0][price_data][currency]": "chf",
      "line_items[0][price_data][unit_amount]": String(amountRappen),
      "line_items[0][price_data][product_data][name]": listing.title,
      "line_items[0][quantity]": "1",
      "mode": "payment",
      "success_url": `clickk://payment-success?session_id={CHECKOUT_SESSION_ID}`,
      "cancel_url": `clickk://payment-cancel`,
      "metadata[listing_id]": listing_id,
      "metadata[buyer_id]": buyer_id,
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
      throw new Error(session.error.message ?? "stripe_error");
    }

    return new Response(
      JSON.stringify({ checkoutUrl: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
