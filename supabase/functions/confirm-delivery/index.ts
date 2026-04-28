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
    const token = authHeader.replace("Bearer ", "").trim();

    let buyer_id: string | null = null;
    let systemMode = false;

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (!userErr && userData?.user) {
      buyer_id = userData.user.id;
    } else if (token === serviceRoleKey) {
      systemMode = true;
      console.log("[confirm-delivery] system mode auto-release");
    } else {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

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
    if (!systemMode && story.buyer_id !== buyer_id) {
      return jsonResponse({ error: "forbidden" }, 403);
    }
    if (story.status === "delivered") {
      return jsonResponse({ success: true, already_delivered: true }, 200);
    }
    if (!systemMode && story.status !== "sold") {
      return jsonResponse({ error: "invalid_status" }, 400);
    }
    if (systemMode && story.status !== "sold" && story.status !== "shipped") {
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
    if (systemMode) {
      transferParams.append("metadata[release_reason]", "auto_released");
    }

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

    const updatePayload: Record<string, unknown> = {
      status: "delivered",
      delivered_at: new Date().toISOString(),
    };
    if (systemMode) {
      updatePayload.release_reason = "auto_released";
    }

    const allowedStatuses = systemMode ? ["sold", "shipped"] : ["sold"];
    const { error: updateErr } = await admin
      .from("stories")
      .update(updatePayload)
      .eq("id", story_id)
      .in("status", allowedStatuses);

    if (updateErr) {
      return jsonResponse({ error: "story_update_failed" }, 500);
    }

    const buyerNotifTitle = systemMode
      ? "Paiement libéré automatiquement"
      : "Réception confirmée";
    const buyerNotifMessage = systemMode
      ? "Le paiement a été libéré automatiquement au vendeur après 7 jours."
      : "Merci d'avoir confirmé la réception";
    const sellerNotifMessage = systemMode
      ? "Paiement libéré automatiquement après 7 jours."
      : "Livraison confirmée — fonds transférés";

    const buyerRecipient = story.buyer_id ?? buyer_id;
    const notifRows = [
      {
        user_id: story.seller_id,
        type: "delivery_confirmed",
        title: "Livraison confirmée",
        message: sellerNotifMessage,
        payload: { story_id, auto_released: systemMode },
      },
    ];
    if (buyerRecipient) {
      notifRows.push({
        user_id: buyerRecipient,
        type: "delivery_confirmed",
        title: buyerNotifTitle,
        message: buyerNotifMessage,
        payload: { story_id, auto_released: systemMode },
      });
    }
    await admin.from("notifications").insert(notifRows);

    // Send push notifications (fire-and-forget)
    const pushCalls: Promise<unknown>[] = [];

    pushCalls.push(
      fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          user_id: story.seller_id,
          title: "Livraison confirmée",
          body: sellerNotifMessage,
          data: { story_id, auto_released: systemMode },
        }),
      }).catch(() => {})
    );

    if (buyerRecipient) {
      pushCalls.push(
        fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            user_id: buyerRecipient,
            title: buyerNotifTitle,
            body: buyerNotifMessage,
            data: { story_id, auto_released: systemMode },
          }),
        }).catch(() => {})
      );
    }

    EdgeRuntime.waitUntil(Promise.all(pushCalls));

    return jsonResponse({
      success: true,
      transfer_id: transfer.id,
      amount_chf: amount_cents / 100,
      auto_released: systemMode,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    return jsonResponse({ error: message }, 500);
  }
});
