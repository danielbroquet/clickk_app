import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";

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

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "supabase_not_configured" }, 500);
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
    const user_id = userData.user.id;

    const { story_id, tracking_number } = await req.json();
    if (!story_id || typeof story_id !== "string") {
      return jsonResponse({ error: "invalid_params" }, 400);
    }
    if (tracking_number !== undefined && tracking_number !== null) {
      if (
        typeof tracking_number !== "string" ||
        tracking_number.length < 5 ||
        tracking_number.length > 30
      ) {
        return jsonResponse({ error: "invalid_tracking_number" }, 400);
      }
    }

    const { data: story, error: storyErr } = await admin
      .from("stories")
      .select("id, seller_id, buyer_id, status, shipped_at")
      .eq("id", story_id)
      .maybeSingle();

    if (storyErr) {
      return jsonResponse({ error: "story_lookup_failed" }, 500);
    }
    if (!story) {
      return jsonResponse({ error: "story_not_found" }, 404);
    }
    if (story.seller_id !== user_id) {
      return jsonResponse({ error: "forbidden" }, 403);
    }
    if (story.status === "shipped") {
      return jsonResponse({ success: true, already_shipped: true }, 200);
    }
    if (story.status !== "sold") {
      return jsonResponse({ error: "invalid_status" }, 400);
    }

    const tracking = typeof tracking_number === "string" ? tracking_number : null;
    const shipped_at = new Date().toISOString();

    const { error: updateErr } = await admin
      .from("stories")
      .update({
        status: "shipped",
        shipped_at,
        tracking_number: tracking,
      })
      .eq("id", story_id)
      .eq("status", "sold");

    if (updateErr) {
      return jsonResponse({ error: "story_update_failed" }, 500);
    }

    await admin.from("notifications").insert([
      {
        user_id: story.buyer_id,
        type: "order_shipped",
        title: "Colis expédié",
        message: tracking
          ? "Votre colis a été expédié. Suivi: " + tracking
          : "Votre colis a été expédié",
        payload: { story_id, tracking_number: tracking },
      },
    ]);

    // Send push notification to buyer
    if (story.buyer_id) {
      fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          user_id: story.buyer_id,
          title: "Colis expédié",
          body: tracking
            ? `Votre colis est en route. Suivi: ${tracking}`
            : "Votre colis a été expédié",
          data: { story_id, tracking_number: tracking },
        }),
      }).catch(() => {});

      try {
        await sendPushNotification(
          admin,
          story.buyer_id,
          "Votre commande est en route 📦",
          "Le vendeur a expédié votre commande.",
          { type: "order_shipped", orderId: story_id },
        );
      } catch (err) {
        console.error("[mark-shipped] push notification error:", err instanceof Error ? err.message : String(err));
      }
    }

    return jsonResponse({
      success: true,
      shipped_at,
      tracking_number: tracking,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    return jsonResponse({ error: message }, 500);
  }
});
