import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const parts = signature.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.split("=")[1];
  const sig = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

  if (!timestamp || !sig) return false;

  const signedPayload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );
  const expectedSig = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expectedSig === sig;
}

interface StripeEventMetadata {
  story_id?: string;
  buyer_id?: string;
  amount_chf?: string;
}

interface StripeObject {
  metadata?: StripeEventMetadata;
}

interface StripeEvent {
  type: string;
  id: string;
  data: { object: StripeObject };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
      console.error("[stripe-webhook] Missing required environment variables");
      return new Response(JSON.stringify({ error: "server_misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("[stripe-webhook] Service role key present:", !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.text();
    const sig = req.headers.get("stripe-signature") ?? "";

    if (!sig) {
      console.error("[stripe-webhook] Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "missing_signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const valid = await verifyStripeSignature(body, sig, webhookSecret);
    if (!valid) {
      console.error("[stripe-webhook] Signature verification failed");
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(body) as StripeEvent;
    const eventType = event.type;
    const session = event.data.object;

    console.log(`[stripe-webhook] Received event: ${eventType} (${event.id})`);

    if (eventType === "checkout.session.completed") {
      const { story_id, buyer_id, amount_chf } = session.metadata ?? {};

      if (!story_id || !buyer_id || !amount_chf) {
        console.error("[stripe-webhook] Missing metadata fields:", session.metadata);
        return new Response(JSON.stringify({ received: true, warning: "missing_metadata" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const parsedAmount = parseFloat(amount_chf);
      const trimmedStoryId = story_id.trim();
      const trimmedBuyerId = buyer_id.trim();
      console.log(`[stripe-webhook] Processing purchase: story=${trimmedStoryId} buyer=${trimmedBuyerId} amount=${parsedAmount}`);
      console.log("[stripe-webhook] Attempting SELECT for story:", trimmedStoryId);

      const { data: story, error: fetchError } = await supabase
        .from("stories")
        .select("id, seller_id, status, buyer_id")
        .eq("id", trimmedStoryId)
        .eq("status", "active")
        .is("buyer_id", null)
        .maybeSingle();

      console.log("[stripe-webhook] SELECT result - data:", JSON.stringify(story));
      console.log("[stripe-webhook] SELECT result - error:", JSON.stringify(fetchError));

      if (fetchError) {
        console.error("[stripe-webhook] Error fetching story:", fetchError.message);
        throw new Error(`DB select failed: ${fetchError.message}`);
      }

      if (!story) {
        console.log(`[stripe-webhook] Story ${trimmedStoryId} already processed or not active — skipping (idempotent)`);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log("[stripe-webhook] Attempting UPDATE for story:", trimmedStoryId);

      const { data: updatedRows, error: updateError } = await supabase
        .from("stories")
        .update({
          status: "sold",
          buyer_id: trimmedBuyerId,
          final_price_chf: parsedAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", trimmedStoryId)
        .eq("status", "active")
        .is("buyer_id", null)
        .select();

      console.log("[stripe-webhook] UPDATE result - data:", JSON.stringify(updatedRows));
      console.log("[stripe-webhook] UPDATE result - error:", JSON.stringify(updateError));
      console.log("[stripe-webhook] UPDATE result - rows affected:", updatedRows?.length ?? 0);

      if (updateError) {
        console.error("[stripe-webhook] Error updating story:", updateError.message);
        throw new Error(`DB update failed: ${updateError.message}`);
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.log(`[stripe-webhook] WARNING: UPDATE matched 0 rows — story ${trimmedStoryId} may already be sold or UUID mismatch`);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log(`[stripe-webhook] Story ${trimmedStoryId} marked as sold`);

      const notifications = [
        {
          user_id: trimmedBuyerId,
          type: "purchase",
          title: "Achat confirmé",
          message: `Votre achat a été confirmé pour CHF ${parsedAmount.toFixed(2)}.`,
          is_read: false,
        },
        {
          user_id: story.seller_id,
          type: "story_sold",
          title: "Article vendu !",
          message: `Votre story a été vendue pour CHF ${parsedAmount.toFixed(2)}.`,
          is_read: false,
        },
      ];

      const { error: notifError } = await supabase.from("notifications").insert(notifications);

      if (notifError) {
        console.error("[stripe-webhook] Error inserting notifications:", notifError.message);
      } else {
        console.log(`[stripe-webhook] Notifications sent to buyer ${trimmedBuyerId} and seller ${story.seller_id}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (eventType === "payment_intent.succeeded") {
      const { story_id, buyer_id, amount_chf } = session.metadata ?? {};

      if (!story_id) {
        console.log("[stripe-webhook] payment_intent.succeeded: no story_id in metadata — not a Clickk payment, skipping");
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!buyer_id || !amount_chf) {
        console.error("[stripe-webhook] payment_intent.succeeded: missing buyer_id or amount_chf in metadata:", session.metadata);
        return new Response(JSON.stringify({ received: true, warning: "missing_metadata" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const parsedAmount = parseFloat(amount_chf);
      const trimmedStoryId = story_id.trim();
      const trimmedBuyerId = buyer_id.trim();
      console.log(`[stripe-webhook] payment_intent.succeeded: story=${trimmedStoryId} buyer=${trimmedBuyerId} amount=${parsedAmount}`);
      console.log("[stripe-webhook] payment_intent.succeeded: Attempting SELECT for story:", trimmedStoryId);

      const { data: story, error: fetchError } = await supabase
        .from("stories")
        .select("id, seller_id, status, buyer_id")
        .eq("id", trimmedStoryId)
        .eq("status", "active")
        .is("buyer_id", null)
        .maybeSingle();

      console.log("[stripe-webhook] payment_intent.succeeded: SELECT result - data:", JSON.stringify(story));
      console.log("[stripe-webhook] payment_intent.succeeded: SELECT result - error:", JSON.stringify(fetchError));

      if (fetchError) {
        console.error("[stripe-webhook] payment_intent.succeeded: error fetching story:", fetchError.message);
        throw new Error(`DB select failed: ${fetchError.message}`);
      }

      if (!story) {
        console.log(`[stripe-webhook] payment_intent.succeeded: story ${trimmedStoryId} already processed — skipping (idempotent)`);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log("[stripe-webhook] payment_intent.succeeded: Attempting UPDATE for story:", trimmedStoryId);

      const { data: updatedRows, error: updateError } = await supabase
        .from("stories")
        .update({
          status: "sold",
          buyer_id: trimmedBuyerId,
          final_price_chf: parsedAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", trimmedStoryId)
        .eq("status", "active")
        .is("buyer_id", null)
        .select();

      console.log("[stripe-webhook] payment_intent.succeeded: UPDATE result - data:", JSON.stringify(updatedRows));
      console.log("[stripe-webhook] payment_intent.succeeded: UPDATE result - error:", JSON.stringify(updateError));
      console.log("[stripe-webhook] payment_intent.succeeded: UPDATE result - rows affected:", updatedRows?.length ?? 0);

      if (updateError) {
        console.error("[stripe-webhook] payment_intent.succeeded: error updating story:", updateError.message);
        throw new Error(`DB update failed: ${updateError.message}`);
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.log(`[stripe-webhook] payment_intent.succeeded: WARNING — UPDATE matched 0 rows for story ${trimmedStoryId}`);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log(`[stripe-webhook] payment_intent.succeeded: story ${trimmedStoryId} marked as sold`);

      const notifications = [
        {
          user_id: trimmedBuyerId,
          type: "purchase",
          title: "Achat confirmé",
          message: `Votre achat a été confirmé pour CHF ${parsedAmount.toFixed(2)}.`,
          is_read: false,
        },
        {
          user_id: story.seller_id,
          type: "story_sold",
          title: "Article vendu !",
          message: `Votre story a été vendue pour CHF ${parsedAmount.toFixed(2)}.`,
          is_read: false,
        },
      ];

      const { error: notifError } = await supabase.from("notifications").insert(notifications);

      if (notifError) {
        console.error("[stripe-webhook] payment_intent.succeeded: error inserting notifications:", notifError.message);
      } else {
        console.log(`[stripe-webhook] payment_intent.succeeded: notifications sent to buyer ${trimmedBuyerId} and seller ${story.seller_id}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (eventType === "checkout.session.expired") {
      const story_id = session.metadata?.story_id;
      console.log(`[stripe-webhook] Checkout expired for story ${story_id ?? "unknown"} — no DB change needed`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[stripe-webhook] Ignoring unhandled event type: ${eventType}`);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal_error";
    console.error("[stripe-webhook] Unexpected error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
