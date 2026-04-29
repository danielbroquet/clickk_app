import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";

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
  listing_id?: string;
  seller_id?: string;
  type?: string;
}

interface StripeObject {
  id?: string;
  metadata?: StripeEventMetadata;
  details_submitted?: boolean;
}

const PI_LOG = "[stripe-webhook payment_intent.succeeded]";

async function refundPaymentIntent(paymentIntentId: string, stripeKey: string): Promise<void> {
  const params = new URLSearchParams();
  params.set("payment_intent", paymentIntentId);

  const res = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    console.error(`${PI_LOG} refund failed:`, json.error?.message ?? "unknown");
    return;
  }
  console.log(`${PI_LOG} refund issued for ${paymentIntentId}`);
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

  try {
    await sendPushNotification(
      supabase,
      buyerId,
      "Commande confirmée 🎉",
      "Votre paiement est accepté. Le vendeur va préparer votre commande.",
      { type: "order_confirmed", orderId: storyId },
    );
    await sendPushNotification(
      supabase,
      story.seller_id as string,
      "Nouvelle vente 💰",
      "Vous avez une nouvelle commande à expédier !",
      { type: "new_sale", orderId: storyId },
    );
  } catch (err) {
    console.error("[stripe-webhook] push notification error:", err instanceof Error ? err.message : String(err));
  }
}

Deno.serve(async (req: Request) => {
  try {
    console.log(
      `[WEBHOOK] incoming ${req.method} ${new URL(req.url).pathname} ` +
        `sig=${req.headers.get("stripe-signature") ? "present" : "missing"} ` +
        `ua=${req.headers.get("user-agent") ?? "?"}`
    );

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const connectWebhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");
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

    const secrets = [webhookSecret, ...(connectWebhookSecret ? [connectWebhookSecret] : [])];
    let valid = false;
    for (const secret of secrets) {
      if (await verifyStripeSignature(body, sig, secret)) {
        valid = true;
        break;
      }
    }
    if (!valid) {
      console.error(
        `[WEBHOOK] signature_invalid bodyLen=${body.length} ` +
          `secretsTried=${secrets.length}`
      );
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(body) as StripeEvent;
    console.log(`[WEBHOOK] verified event ${event.type} id=${event.id}`);

    if (event.type === "checkout.session.completed") {
      const metadata = event.data.object.metadata ?? {};
      console.log("[WEBHOOK] checkout.session.completed received", {
        session_id: event.data.object.id,
        listing_id: metadata.listing_id,
        type: metadata.type,
      });

      if (metadata.type === "listing") {
        const { listing_id, buyer_id, seller_id, amount_chf } = metadata;

        if (
          !listing_id || !buyer_id || !seller_id || !amount_chf ||
          !UUID_RE.test(listing_id) || !UUID_RE.test(buyer_id) || !UUID_RE.test(seller_id)
        ) {
          console.error("[stripe-webhook] Missing or invalid listing metadata:", metadata);
          return new Response(JSON.stringify({ received: true, warning: "missing_listing_metadata" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const amountChf = parseFloat(amount_chf);
        const commissionChf = Math.round(amountChf * 0.08 * 100) / 100;
        const sellerAmountChf = Math.round(amountChf * 0.92 * 100) / 100;
        const sessionId = event.data.object.id ?? "";

        // Insert the order FIRST so the buyer's purchase is always recorded,
        // even if subsequent stock manipulation fails.
        const { error: orderError } = await supabase
          .from("shop_orders")
          .upsert(
            {
              session_id: sessionId,
              listing_id,
              buyer_id,
              seller_id,
              quantity: 1,
              total_chf: amountChf,
              commission_chf: commissionChf,
              seller_amount_chf: sellerAmountChf,
              status: "paid",
            },
            { onConflict: "session_id", ignoreDuplicates: true }
          );

        if (orderError) {
          console.error("[stripe-webhook] shop_orders insert failed:", orderError.message);
          throw new Error(`shop_orders insert failed: ${orderError.message}`);
        }

        // Fetch current stock then decrement only if > 0 (idempotency via .eq("stock", current))
        const { data: listingRow, error: fetchErr } = await supabase
          .from("shop_listings")
          .select("stock")
          .eq("id", listing_id)
          .maybeSingle();

        if (!fetchErr && listingRow && listingRow.stock > 0) {
          const newStock = listingRow.stock - 1;
          const { error: updateErr } = await supabase
            .from("shop_listings")
            .update({ stock: newStock, is_active: newStock > 0 })
            .eq("id", listing_id)
            .eq("stock", listingRow.stock);

          if (updateErr) {
            console.error("[stripe-webhook] stock decrement failed:", updateErr.message);
          }
        } else if (fetchErr) {
          console.error("[stripe-webhook] stock fetch failed:", fetchErr.message);
        }

        // Safety: ensure is_active is false whenever stock has reached 0.
        {
          const { data: finalStock, error: finalStockErr } = await supabase
            .from("shop_listings")
            .select("stock")
            .eq("id", listing_id)
            .maybeSingle();

          if (!finalStockErr && finalStock && (finalStock.stock ?? 0) <= 0) {
            const { error: deactivateErr } = await supabase
              .from("shop_listings")
              .update({ is_active: false })
              .eq("id", listing_id)
              .lte("stock", 0);
            if (deactivateErr) {
              console.error("[stripe-webhook] deactivate listing failed:", deactivateErr.message);
            }
          }
        }

        const { error: notifError } = await supabase.from("notifications").insert([
          {
            user_id: buyer_id,
            type: "purchase",
            story_id: null,
            message: "Votre commande a été confirmée",
            is_read: false,
          },
          {
            user_id: seller_id,
            type: "story_sold",
            story_id: null,
            message: "Vous avez vendu un article",
            is_read: false,
          },
        ]);

        if (notifError) {
          console.error("[stripe-webhook] listing notifications failed:", notifError.message);
        }

        console.log(`[stripe-webhook] Listing order created: listing=${listing_id} buyer=${buyer_id}`);

        try {
          await sendPushNotification(
            supabase,
            buyer_id,
            "Commande confirmée 🎉",
            "Votre paiement est accepté. Le vendeur va préparer votre commande.",
            { type: "order_confirmed", orderId: sessionId },
          );
          await sendPushNotification(
            supabase,
            seller_id,
            "Nouvelle vente 💰",
            "Vous avez une nouvelle commande à expédier !",
            { type: "new_sale", orderId: sessionId },
          );
        } catch (err) {
          console.error("[stripe-webhook] push notification error:", err instanceof Error ? err.message : String(err));
        }

        return new Response(JSON.stringify({ received: true, listing_id }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { story_id, buyer_id, amount_chf } = metadata;

      if (!story_id || !buyer_id || !amount_chf) {
        console.error("[stripe-webhook] Missing metadata fields:", metadata);
        return new Response(JSON.stringify({ received: true, warning: "missing_metadata" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      await processPurchase(supabase, story_id.trim(), buyer_id.trim(), parseFloat(amount_chf));
    } else if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const paymentIntentId = pi.id ?? "";
      const metadata = pi.metadata ?? {};
      console.log("[WEBHOOK] payment_intent.succeeded received", {
        intent_id: paymentIntentId,
        listing_id: metadata.listing_id,
        story_id: metadata.story_id,
      });
      const { story_id, listing_id, buyer_id, seller_id: sellerIdMeta, amount_chf } = metadata;

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        console.error(`${PI_LOG} STRIPE_SECRET_KEY not configured`);
      }

      if (!buyer_id) {
        console.warn(`${PI_LOG} missing buyer_id`);
        return new Response(JSON.stringify({ received: true, warning: "missing_buyer_id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!amount_chf) {
        console.warn(`${PI_LOG} missing amount_chf`);
        return new Response(JSON.stringify({ received: true, warning: "missing_amount" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const amountChf = parseFloat(amount_chf);

      if (story_id) {
        if (!UUID_RE.test(story_id) || !UUID_RE.test(buyer_id)) {
          console.warn(`${PI_LOG} invalid story_id or buyer_id`);
          return new Response(JSON.stringify({ received: true, warning: "invalid_ids" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: story, error: fetchErr } = await supabase
          .from("stories")
          .select("id, seller_id, status, buyer_id")
          .eq("id", story_id)
          .eq("status", "active")
          .is("buyer_id", null)
          .maybeSingle();

        if (fetchErr) {
          console.error(`${PI_LOG} story select failed:`, fetchErr.message);
          throw new Error(`story select failed: ${fetchErr.message}`);
        }

        if (!story) {
          console.warn(`${PI_LOG} already_sold story=${story_id} — refunding`);
          if (stripeKey && paymentIntentId) {
            await refundPaymentIntent(paymentIntentId, stripeKey);
          }
          await supabase.from("notifications").insert({
            user_id: buyer_id,
            type: "purchase_refunded",
            title: "Achat remboursé",
            message: "Cet article n'était plus disponible. Vous avez été remboursé.",
            is_read: false,
          });
          return new Response(JSON.stringify({ received: true, refunded: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: updatedRows, error: updateErr } = await supabase
          .from("stories")
          .update({
            status: "sold",
            buyer_id,
            final_price_chf: amountChf,
            updated_at: new Date().toISOString(),
          })
          .eq("id", story_id)
          .eq("status", "active")
          .is("buyer_id", null)
          .select();

        if (updateErr) {
          console.error(`${PI_LOG} story update failed:`, updateErr.message);
          throw new Error(`story update failed: ${updateErr.message}`);
        }

        if (!updatedRows || updatedRows.length === 0) {
          console.warn(`${PI_LOG} race lost story=${story_id} — refunding`);
          if (stripeKey && paymentIntentId) {
            await refundPaymentIntent(paymentIntentId, stripeKey);
          }
          await supabase.from("notifications").insert({
            user_id: buyer_id,
            type: "purchase_refunded",
            title: "Achat remboursé",
            message: "Cet article n'était plus disponible. Vous avez été remboursé.",
            is_read: false,
          });
          return new Response(JSON.stringify({ received: true, refunded: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sellerId = story.seller_id as string;
        const { error: notifErr } = await supabase.from("notifications").insert([
          {
            user_id: buyer_id,
            type: "purchase",
            title: "Achat confirmé",
            message: `Votre achat a été confirmé pour CHF ${amountChf.toFixed(2)}.`,
            is_read: false,
          },
          {
            user_id: sellerId,
            type: "story_sold",
            title: "Article vendu !",
            message: `Votre story a été vendue pour CHF ${amountChf.toFixed(2)}.`,
            is_read: false,
          },
        ]);
        if (notifErr) {
          console.error(`${PI_LOG} notifications insert failed:`, notifErr.message);
        }

        try {
          await sendPushNotification(
            supabase,
            buyer_id,
            "Commande confirmée 🎉",
            "Votre paiement est accepté. Le vendeur va préparer votre commande.",
            { type: "order_confirmed", orderId: story_id },
          );
          await sendPushNotification(
            supabase,
            sellerId,
            "Nouvelle vente 💰",
            "Vous avez une nouvelle commande à expédier !",
            { type: "new_sale", orderId: story_id },
          );
        } catch (err) {
          console.error(`${PI_LOG} push notification error:`, err instanceof Error ? err.message : String(err));
        }

        return new Response(JSON.stringify({ received: true, story_id }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } else if (listing_id) {
        if (!UUID_RE.test(listing_id) || !UUID_RE.test(buyer_id)) {
          console.warn(`${PI_LOG} invalid listing_id or buyer_id`);
          return new Response(JSON.stringify({ received: true, warning: "invalid_ids" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: listing, error: fetchErr } = await supabase
          .from("shop_listings")
          .select("id, seller_id, stock, is_active")
          .eq("id", listing_id)
          .maybeSingle();

        if (fetchErr) {
          console.error(`${PI_LOG} listing select failed:`, fetchErr.message);
          throw new Error(`listing select failed: ${fetchErr.message}`);
        }

        if (!listing || !listing.is_active || listing.stock <= 0) {
          console.warn(`${PI_LOG} listing unavailable=${listing_id} — refunding`);
          if (stripeKey && paymentIntentId) {
            await refundPaymentIntent(paymentIntentId, stripeKey);
          }
          await supabase.from("notifications").insert({
            user_id: buyer_id,
            type: "purchase_refunded",
            title: "Achat remboursé",
            message: "Cet article n'était plus disponible. Vous avez été remboursé.",
            is_read: false,
          });
          return new Response(JSON.stringify({ received: true, refunded: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sellerId = (sellerIdMeta && UUID_RE.test(sellerIdMeta))
          ? sellerIdMeta
          : (listing.seller_id as string);

        const piCommissionChf = Math.round(amountChf * 0.08 * 100) / 100;
        const piSellerAmountChf = Math.round(amountChf * 0.92 * 100) / 100;

        const { error: orderErr } = await supabase
          .from("shop_orders")
          .upsert(
            {
              session_id: paymentIntentId,
              listing_id,
              buyer_id,
              seller_id: sellerId,
              quantity: 1,
              total_chf: amountChf,
              commission_chf: piCommissionChf,
              seller_amount_chf: piSellerAmountChf,
              status: "paid",
            },
            { onConflict: "session_id", ignoreDuplicates: true }
          );

        if (orderErr) {
          console.error(`${PI_LOG} shop_orders insert failed:`, orderErr.message);
          throw new Error(`shop_orders insert failed: ${orderErr.message}`);
        }

        const newStock = listing.stock - 1;
        const { error: updateErr } = await supabase
          .from("shop_listings")
          .update({ stock: newStock, is_active: newStock > 0 })
          .eq("id", listing_id)
          .eq("stock", listing.stock);

        if (updateErr) {
          console.error(`${PI_LOG} listing stock update failed:`, updateErr.message);
        }

        // Safety: ensure is_active is false whenever stock has reached 0.
        {
          const { data: finalStock, error: finalStockErr } = await supabase
            .from("shop_listings")
            .select("stock")
            .eq("id", listing_id)
            .maybeSingle();

          if (!finalStockErr && finalStock && (finalStock.stock ?? 0) <= 0) {
            const { error: deactivateErr } = await supabase
              .from("shop_listings")
              .update({ is_active: false })
              .eq("id", listing_id)
              .lte("stock", 0);
            if (deactivateErr) {
              console.error(`${PI_LOG} deactivate listing failed:`, deactivateErr.message);
            }
          }
        }

        const { error: notifErr } = await supabase.from("notifications").insert([
          {
            user_id: buyer_id,
            type: "purchase",
            story_id: null,
            message: "Votre commande a été confirmée",
            is_read: false,
          },
          {
            user_id: sellerId,
            type: "story_sold",
            story_id: null,
            message: "Vous avez vendu un article",
            is_read: false,
          },
        ]);
        if (notifErr) {
          console.error(`${PI_LOG} notifications insert failed:`, notifErr.message);
        }

        try {
          await sendPushNotification(
            supabase,
            buyer_id,
            "Commande confirmée 🎉",
            "Votre paiement est accepté. Le vendeur va préparer votre commande.",
            { type: "order_confirmed", orderId: paymentIntentId },
          );
          await sendPushNotification(
            supabase,
            sellerId,
            "Nouvelle vente 💰",
            "Vous avez une nouvelle commande à expédier !",
            { type: "new_sale", orderId: paymentIntentId },
          );
        } catch (err) {
          console.error(`${PI_LOG} push notification error:`, err instanceof Error ? err.message : String(err));
        }

        return new Response(JSON.stringify({ received: true, listing_id }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } else {
        console.warn(`${PI_LOG} no story_id or listing_id in metadata`);
        return new Response(JSON.stringify({ received: true, warning: "missing_target" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else if (event.type === "account.updated") {
      const account = event.data.object;
      const accountId = account.id;
      if (accountId && account.details_submitted === true) {
        const { data: onboarding, error: obErr } = await supabase
          .from("seller_onboarding")
          .select("user_id")
          .eq("stripe_account_id", accountId)
          .maybeSingle();

        if (obErr) {
          console.error("[stripe-webhook] seller_onboarding select failed:", obErr.message);
        } else if (!onboarding) {
          console.warn(`[stripe-webhook] No seller_onboarding row for account ${accountId}`);
        } else {
          const { error: updOnbErr } = await supabase
            .from("seller_onboarding")
            .update({ status: "complete", updated_at: new Date().toISOString() })
            .eq("stripe_account_id", accountId);

          if (updOnbErr) {
            console.error("[stripe-webhook] seller_onboarding update failed:", updOnbErr.message);
          }

          const userId = onboarding.user_id as string;
          const { error: updProfErr } = await supabase
            .from("profiles")
            .update({ role: "seller" })
            .eq("id", userId);

          if (updProfErr) {
            console.error("[stripe-webhook] profiles update failed:", updProfErr.message);
          } else {
            console.log(`[stripe-webhook] User ${userId} promoted to seller`);
          }

          const stripeAccountId = accountId as string;
          const { error: spErr } = await supabase
            .from("seller_profiles")
            .upsert({ user_id: userId, stripe_account_id: stripeAccountId }, { onConflict: "user_id" });

          if (spErr) {
            console.error("[stripe-webhook] seller_profiles upsert failed:", spErr.message);
          }
        }
      } else {
        console.log(`[stripe-webhook] account.updated for ${accountId ?? "unknown"} — details_submitted=${account.details_submitted}`);
      }
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
