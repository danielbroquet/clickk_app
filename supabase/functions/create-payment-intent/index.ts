import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const { story_id, amount_chf } = await req.json();

    if (!story_id || !amount_chf || typeof amount_chf !== "number" || amount_chf <= 0) {
      return new Response(
        JSON.stringify({ error: "invalid_params" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1])) as { sub?: string };
    const buyer_id = payload.sub;
    if (!buyer_id) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY");
    if (!stripeKey) throw new Error("stripe_not_configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("server_misconfigured");

    // Buyer role check via service role
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${buyer_id}&select=id,role`,
      {
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const profiles = await profileRes.json() as Array<{ id: string; role?: string }>;
    if (!Array.isArray(profiles) || profiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Amount in Rappen (CHF cents)
    const amountRappen = Math.round(amount_chf * 100);

    const params = new URLSearchParams({
      "amount": String(amountRappen),
      "currency": "chf",
      "payment_method_types[]": "card",
      "capture_method": "automatic",
      "metadata[story_id]": story_id,
      "metadata[buyer_id]": buyer_id,
      "metadata[amount_chf]": String(amount_chf),
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const paymentIntent = await stripeRes.json();

    if (paymentIntent.error) {
      throw new Error(paymentIntent.error.message ?? "stripe_error");
    }

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        publishableKey,
      }),
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
