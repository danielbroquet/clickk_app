import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type RefundBody = { story_id?: string };

async function stripeRefund(paymentIntentId: string, stripeKey: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const body = new URLSearchParams();
  body.set("payment_intent", paymentIntentId);
  body.set("reason", "requested_by_customer");

  const resp = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await resp.json();
  if (!resp.ok) return { ok: false, error: json?.error?.message ?? "stripe_error" };
  return { ok: true, id: json.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("stripe_key_missing");

    const { story_id }: RefundBody = await req.json().catch(() => ({}));
    if (!story_id) {
      return new Response(JSON.stringify({ error: "story_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: story, error: fetchErr } = await supabase
      .from("stories")
      .select("id, status, buyer_id, seller_id, final_price_chf, stripe_payment_intent_id, shipped_at")
      .eq("id", story_id)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!story) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (story.shipped_at) {
      return new Response(JSON.stringify({ error: "already_shipped" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (story.status === "refunded" || story.status === "cancelled") {
      return new Response(JSON.stringify({ ok: true, already: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!story.stripe_payment_intent_id) {
      await supabase.from("auto_release_log").insert({
        type: "refund_no_ship",
        reference_id: story.id,
        details: {
          status: "skipped_no_intent",
          needs_admin: true,
          buyer_id: story.buyer_id,
          seller_id: story.seller_id,
          amount_chf: story.final_price_chf,
        },
      });
      return new Response(JSON.stringify({ error: "no_payment_intent", needs_admin: true }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refund = await stripeRefund(story.stripe_payment_intent_id, stripeKey);
    if (!refund.ok) {
      await supabase.from("auto_release_log").insert({
        type: "refund_no_ship",
        reference_id: story.id,
        details: {
          status: "stripe_error",
          needs_admin: true,
          message: refund.error,
          buyer_id: story.buyer_id,
          seller_id: story.seller_id,
        },
      });
      return new Response(JSON.stringify({ error: refund.error, needs_admin: true }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("stories")
      .update({ status: "refunded", updated_at: new Date().toISOString() })
      .eq("id", story.id);

    await supabase.from("notifications").insert([
      {
        user_id: story.buyer_id,
        type: "purchase_refunded",
        title: "Remboursement effectué",
        message: `CHF ${Number(story.final_price_chf ?? 0).toFixed(2)} ont été remboursés : le vendeur n'a pas expédié ton colis.`,
        payload: { story_id: story.id },
      },
      {
        user_id: story.seller_id,
        type: "story_sold",
        title: "Vente annulée",
        message: "Ta vente a été automatiquement remboursée car le colis n'a pas été expédié dans les délais.",
        payload: { story_id: story.id, kind: "auto_refund" },
      },
    ]);

    await supabase.from("auto_release_log").insert({
      type: "refund_no_ship",
      reference_id: story.id,
      details: {
        status: "refunded",
        refund_id: refund.id,
        buyer_id: story.buyer_id,
        seller_id: story.seller_id,
        amount_chf: story.final_price_chf,
      },
    });

    return new Response(JSON.stringify({ ok: true, refund_id: refund.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
