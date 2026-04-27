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
      console.error("[create-payout] supabase env missing");
      return jsonResponse({ error: "supabase_not_configured" }, 500);
    }
    if (!stripeKey) {
      console.error("[create-payout] STRIPE_SECRET_KEY missing");
      return jsonResponse({ error: "stripe_not_configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // 2. Stripe Connect account lookup
    const { data: sellerProfile, error: sellerErr } = await admin
      .from("seller_profiles")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (sellerErr) {
      console.error("[create-payout] seller_profiles lookup failed", sellerErr);
      return jsonResponse({ error: "seller_lookup_failed" }, 500);
    }
    if (!sellerProfile || !sellerProfile.stripe_account_id) {
      return jsonResponse({ error: "no_stripe_account" }, 400);
    }
    const stripeAccountId = sellerProfile.stripe_account_id;

    // 3. Verify payouts_enabled
    const accountRes = await fetch(
      `https://api.stripe.com/v1/accounts/${stripeAccountId}`,
      { headers: { Authorization: `Bearer ${stripeKey}` } },
    );
    const accountData = await accountRes.json();
    if (!accountRes.ok || accountData.error) {
      const e = accountData.error ?? {};
      console.error("[create-payout] account fetch failed", e);
      return jsonResponse(
        { error: e.message ?? "stripe_account_failed", code: e.code, type: e.type },
        502,
      );
    }
    if (accountData.payouts_enabled !== true) {
      return jsonResponse(
        {
          error: "payouts_not_enabled",
          message: "Onboarding incomplete or restricted",
        },
        400,
      );
    }

    // 4. Available balance on the Connect account
    const balanceRes = await fetch("https://api.stripe.com/v1/balance", {
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Stripe-Account": stripeAccountId,
      },
    });
    const balanceData = await balanceRes.json();
    if (!balanceRes.ok || balanceData.error) {
      const e = balanceData.error ?? {};
      console.error("[create-payout] balance fetch failed", e);
      return jsonResponse(
        { error: e.message ?? "stripe_balance_failed", code: e.code, type: e.type },
        502,
      );
    }

    const availableRappen: number = (balanceData.available ?? [])
      .filter((entry: { currency?: string }) => entry.currency === "chf")
      .reduce((sum: number, entry: { amount?: number }) => sum + Number(entry.amount ?? 0), 0);

    // 5. Minimum balance check
    if (availableRappen < 50) {
      return jsonResponse(
        { error: "insufficient_balance", available_chf: availableRappen / 100 },
        400,
      );
    }

    // 6. Optional amount param
    let body: { amount_chf?: number } = {};
    if (req.method !== "GET") {
      try {
        const text = await req.text();
        if (text) body = JSON.parse(text);
      } catch {
        body = {};
      }
    }

    let amountRappen: number;
    if (typeof body.amount_chf === "number" && Number.isFinite(body.amount_chf)) {
      amountRappen = Math.round(body.amount_chf * 100);
      if (amountRappen > availableRappen) {
        return jsonResponse({ error: "amount_exceeds_balance" }, 400);
      }
      if (amountRappen < 50) {
        return jsonResponse({ error: "amount_below_minimum" }, 400);
      }
    } else {
      amountRappen = availableRappen;
    }

    // 7. Idempotency key (deduplicates double-clicks within 60s)
    const minute = Math.floor(Date.now() / 60000);
    const idempotencyKey = `payout-${userId}-${minute}`;

    // 8. Create payout on the Connect account
    const requestedAt = new Date().toISOString();
    const payoutBody = new URLSearchParams();
    payoutBody.set("amount", String(amountRappen));
    payoutBody.set("currency", "chf");
    payoutBody.set("metadata[user_id]", userId);
    payoutBody.set("metadata[requested_at]", requestedAt);

    const payoutRes = await fetch("https://api.stripe.com/v1/payouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Stripe-Account": stripeAccountId,
        "Idempotency-Key": idempotencyKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payoutBody.toString(),
    });
    const payoutData = await payoutRes.json();
    if (!payoutRes.ok || payoutData.error) {
      const e = payoutData.error ?? {};
      console.error("[create-payout] stripe payout failed", e);
      return jsonResponse(
        { error: e.message ?? "stripe_payout_failed", code: e.code, type: e.type },
        502,
      );
    }

    // 9. Audit log (best-effort)
    try {
      await admin.from("payouts_log").insert({
        user_id: userId,
        stripe_payout_id: payoutData.id,
        amount_chf: amountRappen / 100,
        currency: "chf",
        status: payoutData.status ?? "pending",
        arrival_date: payoutData.arrival_date ?? null,
      });
    } catch (logErr) {
      console.error("[create-payout] audit log skipped", logErr);
    }

    // 10. Success
    return jsonResponse({
      success: true,
      amount_chf: amountRappen / 100,
      payout_id: payoutData.id,
      arrival_date: payoutData.arrival_date,
      status: payoutData.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    console.error("[create-payout] unhandled error", err);
    return jsonResponse({ error: message }, 500);
  }
});
