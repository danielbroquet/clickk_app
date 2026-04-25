import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "supabase_not_configured" }, 500);
    }
    if (!stripeKey) {
      return jsonResponse({ error: "stripe_not_configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const buyer_id = userData.user.id;

    const { story_id } = await req.json();
    if (!story_id || typeof story_id !== "string") {
      return jsonResponse({ error: "invalid_params" }, 400);
    }

    const { data: story, error: storyErr } = await admin
      .from("stories")
      .select("id, seller_id, buyer_id, final_price_chf, status")
      .eq("id", story_id)
      .maybeSingle();

    if (storyErr) {
      return jsonResponse({ error: "story_lookup_failed" }, 500);
    }
    if (!story) {
      return jsonResponse({ error: "story_not_found" }, 404);
    }
    if (story.buyer_id !== buyer_id) {
      return jsonResponse({ error: "forbidden" }, 403);
    }
    if (story.status === "delivered") {
      return jsonResponse({ success: true, already_delivered: true }, 200);
    }
    if (story.status !== "sold") {
      return jsonResponse({ error: "invalid_status" }, 400);
    }
    if (!story.final_price_chf || story.final_price_chf <= 0) {
      return jsonResponse({ error: "invalid_price" }, 400);
    }

    const amount_cents = Math.round(Number(story.final_price_chf) * 0.92 * 100);

    const { data: sellerProfile, error: sellerErr } = await admin
      .from("seller_profiles")
      .select("stripe_account_id")
      .eq("user_id", story.seller_id)
      .maybeSingle();

    if (sellerErr) {
      return jsonResponse({ error: "seller_lookup_failed" }, 500);
    }
    if (!sellerProfile?.stripe_account_id) {
      return jsonResponse({ error: "seller_stripe_account_missing" }, 400);
    }

    const transferParams = new URLSearchParams({
      amount: String(amount_cents),
      currency: "chf",
      destination: sellerProfile.stripe_account_id,
      "metadata[story_id]": story_id,
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/transfers", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `transfer-${story_id}`,
      },
      body: transferParams.toString(),
    });

    const transfer = await stripeRes.json();
    if (!stripeRes.ok || transfer.error) {
      return jsonResponse(
        { error: transfer.error?.message ?? "stripe_transfer_failed" },
        502,
      );
    }

    const { error: updateErr } = await admin
      .from("stories")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", story_id)
      .eq("status", "sold");

    if (updateErr) {
      return jsonResponse({ error: "story_update_failed" }, 500);
    }

    await admin.from("notifications").insert([
      {
        user_id: story.seller_id,
        type: "delivery_confirmed",
        title: "Livraison confirmée",
        message: "Livraison confirmée — fonds transférés",
        payload: { story_id },
      },
      {
        user_id: buyer_id,
        type: "delivery_confirmed",
        title: "Réception confirmée",
        message: "Merci d'avoir confirmé la réception",
        payload: { story_id },
      },
    ]);

    return jsonResponse({
      success: true,
      transfer_id: transfer.id,
      amount_chf: amount_cents / 100,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    return jsonResponse({ error: message }, 500);
  }
});
