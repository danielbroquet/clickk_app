import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@12?target=deno";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
      console.error("[stripe-webhook] Missing required environment variables");
      return new Response(JSON.stringify({ error: "server_misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Read raw body as text — MUST happen before any JSON parsing
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      console.error("[stripe-webhook] Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "missing_signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "signature_verification_failed";
      console.error("[stripe-webhook] Signature verification failed:", msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const { story_id, buyer_id, amount_chf } = session.metadata ?? {};

      if (!story_id || !buyer_id || !amount_chf) {
        console.error("[stripe-webhook] Missing metadata fields:", session.metadata);
        return new Response(JSON.stringify({ received: true, warning: "missing_metadata" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const parsedAmount = parseFloat(amount_chf);
      console.log(`[stripe-webhook] Processing purchase: story=${story_id} buyer=${buyer_id} amount=${parsedAmount}`);

      // Check story is still available (idempotency guard)
      const { data: story, error: fetchError } = await supabase
        .from("stories")
        .select("id, seller_id, status, buyer_id")
        .eq("id", story_id)
        .eq("status", "active")
        .is("buyer_id", null)
        .maybeSingle();

      if (fetchError) {
        console.error("[stripe-webhook] Error fetching story:", fetchError.message);
        return new Response(JSON.stringify({ error: "db_error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!story) {
        console.log(`[stripe-webhook] Story ${story_id} already processed or not active — skipping (idempotent)`);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Mark story as sold — conditional update prevents race condition
      const { error: updateError, count } = await supabase
        .from("stories")
        .update({
          status: "sold",
          buyer_id: buyer_id,
          final_price_chf: parsedAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", story_id)
        .eq("status", "active")
        .is("buyer_id", null)
        .select("id", { count: "exact", head: true });

      if (updateError) {
        console.error("[stripe-webhook] Error updating story:", updateError.message);
        return new Response(JSON.stringify({ error: "db_update_error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!count || count === 0) {
        console.log(`[stripe-webhook] Story ${story_id} was claimed by another buyer — skipping notifications`);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log(`[stripe-webhook] Story ${story_id} marked as sold`);

      // Insert notifications for buyer and seller in parallel
      const notifications = [
        {
          user_id: buyer_id,
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
        // Non-fatal: story is already sold, notifications are best-effort
        console.error("[stripe-webhook] Error inserting notifications:", notifError.message);
      } else {
        console.log(`[stripe-webhook] Notifications sent to buyer ${buyer_id} and seller ${story.seller_id}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { story_id, buyer_id, amount_chf } = paymentIntent.metadata ?? {};

      if (!story_id) {
        console.log("[stripe-webhook] payment_intent.succeeded: no story_id in metadata — not a Clickk payment, skipping");
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!buyer_id || !amount_chf) {
        console.error("[stripe-webhook] payment_intent.succeeded: missing buyer_id or amount_chf in metadata:", paymentIntent.metadata);
        return new Response(JSON.stringify({ received: true, warning: "missing_metadata" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const parsedAmount = parseFloat(amount_chf);
      console.log(`[stripe-webhook] payment_intent.succeeded: story=${story_id} buyer=${buyer_id} amount=${parsedAmount}`);

      const { data: story, error: fetchError } = await supabase
        .from("stories")
        .select("id, seller_id, status, buyer_id")
        .eq("id", story_id)
        .eq("status", "active")
        .is("buyer_id", null)
        .maybeSingle();

      if (fetchError) {
        console.error("[stripe-webhook] payment_intent.succeeded: error fetching story:", fetchError.message);
        return new Response(JSON.stringify({ error: "db_error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!story) {
        console.log(`[stripe-webhook] payment_intent.succeeded: story ${story_id} already processed — skipping (idempotent)`);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { error: updateError, count } = await supabase
        .from("stories")
        .update({
          status: "sold",
          buyer_id: buyer_id,
          final_price_chf: parsedAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", story_id)
        .eq("status", "active")
        .is("buyer_id", null)
        .select("id", { count: "exact", head: true });

      if (updateError) {
        console.error("[stripe-webhook] payment_intent.succeeded: error updating story:", updateError.message);
        return new Response(JSON.stringify({ error: "db_update_error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!count || count === 0) {
        console.log(`[stripe-webhook] payment_intent.succeeded: story ${story_id} claimed by another buyer — skipping notifications`);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log(`[stripe-webhook] payment_intent.succeeded: story ${story_id} marked as sold`);

      const notifications = [
        {
          user_id: buyer_id,
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
        console.log(`[stripe-webhook] payment_intent.succeeded: notifications sent to buyer ${buyer_id} and seller ${story.seller_id}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const story_id = session.metadata?.story_id;
      console.log(`[stripe-webhook] Checkout expired for story ${story_id ?? "unknown"} — no DB change needed`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // All other event types — acknowledge and ignore
    console.log(`[stripe-webhook] Ignoring unhandled event type: ${event.type}`);
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
