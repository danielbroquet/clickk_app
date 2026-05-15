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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error(`${LOG} auth.getUser failed`, userErr?.message);
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error(`${LOG} STRIPE_SECRET_KEY not configured`);
      return jsonResponse({ error: "stripe_not_configured" }, 500);
    }

    const { data: profile, error: selectErr } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (selectErr) {
      console.error(`${LOG} profile select failed`, selectErr.message);
      return jsonResponse({ error: selectErr.message }, 500);
    }

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      // Auto-create Stripe customer
      const { data: userDataForEmail } = await supabase.auth.admin.getUserById(userId);
      const email = userDataForEmail?.user?.email;

      const customerParams = new URLSearchParams();
      if (email) customerParams.set("email", email);
      customerParams.set("metadata[user_id]", userId);

      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: customerParams.toString(),
      });

      const customerJson = await customerRes.json();

      if (!customerRes.ok || customerJson.error) {
        const message = customerJson.error?.message ?? "stripe_customer_creation_failed";
        console.error(`${LOG} auto customer creation failed`, message);
        return jsonResponse({ error: message }, 502);
      }

      customerId = customerJson.id as string;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);

      console.log(`${LOG} auto-created stripe customer`, customerId, "for user", userId);
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
