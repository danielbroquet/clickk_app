import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function processPurchase(
  supabase: ReturnType<typeof createClient>,
  storyId: string,
  buyerId: string,
  amountChf: number
): Promise<void> {
  if (!UUID_RE.test(storyId)) {
    console.warn(`[stripe-webhook] story_id "${storyId}" is not a valid UUID — skipping`);
    return;
  }
  if (!UUID_RE.test(buyerId)) {
    console.warn(`[stripe-webhook] buyer_id "${buyerId}" is not a valid UUID — skipping`);
    return;
  }

  console.log(`[stripe-webhook] Processing purchase: story=${storyId} buyer=${buyerId} amount=${amountChf}`);

  const { data: story, error: fetchError } = await supabase
    .from("stories")
    .select("id, seller_id, status, buyer_id")
    .eq("id", storyId)
    .eq("status", "active")
    .is("buyer_id", null)
    .maybeSingle();

  if (fetchError) throw new Error(`DB select failed: ${fetchError.message}`);

  if (!story) {
    console.log(`[stripe-webhook] Story ${storyId} already processed or not active — skipping (idempotent)`);
    return;
  }

  const { data: updatedRows, error: updateError } = await supabase
    .from("stories")
    .update({
      status: "sold",
      buyer_id: buyerId,
      final_price_chf: amountChf,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storyId)
    .eq("status", "active")
    .is("buyer_id", null)
    .select();

  if (updateError) throw new Error(`DB update failed: ${updateError.message}`);

  if (!updatedRows || updatedRows.length === 0) {
    console.warn(`[stripe-webhook] UPDATE matched 0 rows — story ${storyId} may already be sold`);
    return;
  }

  console.log(`[stripe-webhook] Story ${storyId} marked as sold`);

  const { error: notifError } = await supabase.from("notifications").insert([
    {
      user_id: buyerId,
      type: "purchase",
      title: "Achat confirmé",
      message: `Votre achat a été confirmé pour CHF ${amountChf.toFixed(2)}.`,
      is_read: false,
    },
    {
      user_id: story.seller_id,
      type: "story_sold",
      title: "Article vendu !",
      message: `Votre story a été vendue pour CHF ${amountChf.toFixed(2)}.`,
      is_read: false,
    },
  ]);

  if (notifError) {
    console.error("[stripe-webhook] Error inserting notifications:", notifError.message);
  } else {
    console.log(`[stripe-webhook] Notifications sent to buyer ${buyerId} and seller ${story.seller_id}`);
  }
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

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.text();
    const sig = req.headers.get("stripe-signature") ?? "";

    if (!sig) {
      return new Response(JSON.stringify({ error: "missing_signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const valid = await verifyStripeSignature(body, sig, webhookSecret);
    if (!valid) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(body) as StripeEvent;
    console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`);

    if (event.type === "checkout.session.completed") {
      const { story_id, buyer_id, amount_chf } = event.data.object.metadata ?? {};

      if (!story_id || !buyer_id || !amount_chf) {
        console.error("[stripe-webhook] Missing metadata fields:", event.data.object.metadata);
        return new Response(JSON.stringify({ received: true, warning: "missing_metadata" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      await processPurchase(supabase, story_id.trim(), buyer_id.trim(), parseFloat(amount_chf));
    } else if (event.type === "checkout.session.expired") {
      const story_id = event.data.object.metadata?.story_id;
      console.log(`[stripe-webhook] Checkout expired for story ${story_id ?? "unknown"} — no DB change needed`);
    } else {
      console.log(`[stripe-webhook] Ignoring unhandled event type: ${event.type}`);
    }

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
