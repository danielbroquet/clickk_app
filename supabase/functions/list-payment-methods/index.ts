import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LOG = "[list-payment-methods]";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface StripePaymentMethod {
  id: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
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
    let userId: string | undefined;
    try {
      const payload = JSON.parse(atob(token.split(".")[1])) as { sub?: string };
      userId = payload.sub;
    } catch (err) {
      console.error(`${LOG} failed to parse jwt`, err);
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (!userId) {
      console.error(`${LOG} jwt missing sub`);
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error(`${LOG} STRIPE_SECRET_KEY not configured`);
      return jsonResponse({ error: "stripe_not_configured" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: selectErr } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (selectErr) {
      console.error(`${LOG} profile select failed`, selectErr.message);
      return jsonResponse({ error: selectErr.message }, 500);
    }

    const customerId = profile?.stripe_customer_id;
    if (!customerId) {
      return jsonResponse({ payment_methods: [] });
    }

    const url = `https://api.stripe.com/v1/payment_methods?customer=${encodeURIComponent(
      customerId
    )}&type=card`;

    const stripeRes = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
      },
    });

    const stripeJson = await stripeRes.json();

    if (!stripeRes.ok || stripeJson.error) {
      const message = stripeJson.error?.message ?? "stripe_error";
      console.error(`${LOG} list payment methods failed`, message);
      return jsonResponse({ error: message }, 502);
    }

    const data = (stripeJson.data ?? []) as StripePaymentMethod[];

    const paymentMethods = data
      .filter((pm) => pm.card)
      .map((pm) => ({
        id: pm.id,
        brand: pm.card!.brand,
        last4: pm.card!.last4,
        exp_month: pm.card!.exp_month,
        exp_year: pm.card!.exp_year,
      }));

    return jsonResponse({ payment_methods: paymentMethods });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    console.error(`${LOG} unexpected error`, message);
    return jsonResponse({ error: message }, 500);
  }
});
