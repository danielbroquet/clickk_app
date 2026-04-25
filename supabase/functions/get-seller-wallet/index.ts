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

    // 2. Check seller role
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr || !profile) {
      return jsonResponse({ error: "profile_not_found" }, 404);
    }
    if (profile.role !== "seller") {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    // 3. Get Stripe Connect account
    const { data: sellerProfile, error: sellerErr } = await admin
      .from("seller_profiles")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (sellerErr || !sellerProfile?.stripe_account_id) {
      return jsonResponse({ error: "seller_profile_not_found" }, 404);
    }
    const stripeAccountId = sellerProfile.stripe_account_id;

    // 4. Pending escrow: sold but not yet delivered
    const { data: soldStories, error: storiesErr } = await admin
      .from("stories")
      .select("final_price_chf")
      .eq("seller_id", userId)
      .eq("status", "sold");

    if (storiesErr) {
      return jsonResponse({ error: "stories_lookup_failed" }, 500);
    }

    const escrow_pending_chf = (soldStories ?? []).reduce(
      (sum, s) => sum + (Number(s.final_price_chf ?? 0) * 0.92),
      0,
    );

    const stripeHeaders = {
      "Authorization": `Bearer ${stripeKey}`,
      "Stripe-Account": stripeAccountId,
    };

    // 5a. Balance
    const balanceRes = await fetch("https://api.stripe.com/v1/balance", {
      headers: stripeHeaders,
    });
    const balance = await balanceRes.json();
    if (!balanceRes.ok || balance.error) {
      return jsonResponse({ error: balance.error?.message ?? "stripe_balance_failed" }, 502);
    }

    const availableEntry = (balance.available ?? []).find((e: any) => e.currency === "chf")
      ?? balance.available?.[0]
      ?? { amount: 0 };
    const pendingEntry = (balance.pending ?? []).find((e: any) => e.currency === "chf")
      ?? balance.pending?.[0]
      ?? { amount: 0 };

    const available_chf = availableEntry.amount / 100;
    const stripe_pending_chf = pendingEntry.amount / 100;

    // 5b. Transfers received (last 10)
    const transfersParams = new URLSearchParams({
      limit: "10",
      destination: stripeAccountId,
    });
    const transfersRes = await fetch(
      `https://api.stripe.com/v1/transfers?${transfersParams.toString()}`,
      { headers: { "Authorization": `Bearer ${stripeKey}` } },
    );
    const transfersData = await transfersRes.json();
    if (!transfersRes.ok || transfersData.error) {
      return jsonResponse({ error: transfersData.error?.message ?? "stripe_transfers_failed" }, 502);
    }

    const transfers = (transfersData.data ?? []).map((t: any) => ({
      id: t.id,
      amount_chf: t.amount / 100,
      date: t.created,
      description: t.description ?? t.metadata?.story_id ?? null,
    }));

    // 5c. Payouts to bank (last 10)
    const payoutsRes = await fetch("https://api.stripe.com/v1/payouts?limit=10", {
      headers: stripeHeaders,
    });
    const payoutsData = await payoutsRes.json();
    if (!payoutsRes.ok || payoutsData.error) {
      return jsonResponse({ error: payoutsData.error?.message ?? "stripe_payouts_failed" }, 502);
    }

    const payouts = (payoutsData.data ?? []).map((p: any) => ({
      id: p.id,
      amount_chf: p.amount / 100,
      arrival_date: p.arrival_date,
      status: p.status,
    }));

    return jsonResponse({
      available_chf,
      stripe_pending_chf,
      escrow_pending_chf: Math.round(escrow_pending_chf * 100) / 100,
      transfers,
      payouts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    return jsonResponse({ error: message }, 500);
  }
});
