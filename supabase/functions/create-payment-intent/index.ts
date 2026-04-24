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
    if (!stripeKey) throw new Error("stripe_not_configured");

    const amountRappen = Math.round(amount_chf * 100);

    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "line_items[0][price_data][currency]": "chf",
      "line_items[0][price_data][unit_amount]": String(amountRappen),
      "line_items[0][price_data][product_data][name]": `clickk — Story ${story_id}`,
      "line_items[0][quantity]": "1",
      "mode": "payment",
      "success_url": `clickk://payment-success?session_id={CHECKOUT_SESSION_ID}`,
      "cancel_url": `clickk://payment-cancel`,
      "metadata[story_id]": story_id,
      "metadata[buyer_id]": buyer_id,
      "metadata[amount_chf]": String(amount_chf),
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
