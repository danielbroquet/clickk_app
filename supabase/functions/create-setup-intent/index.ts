import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LOG = "[create-setup-intent]";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      console.error(`${LOG} customer not initialized for user`, userId);
      return jsonResponse({ error: "customer_not_initialized" }, 400);
    }

    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.append("payment_method_types[]", "card");
    params.set("usage", "off_session");
    params.set("metadata[user_id]", userId);

    const stripeRes = await fetch("https://api.stripe.com/v1/setup_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const stripeJson = await stripeRes.json();

    if (!stripeRes.ok || stripeJson.error) {
      const message = stripeJson.error?.message ?? "stripe_error";
      console.error(`${LOG} setup intent creation failed`, message);
      return jsonResponse({ error: message }, 502);
    }

    return jsonResponse({
      client_secret: stripeJson.client_secret,
      customer_id: customerId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    console.error(`${LOG} unexpected error`, message);
    return jsonResponse({ error: message }, 500);
  }
});
