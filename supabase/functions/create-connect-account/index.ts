import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_REFRESH_URL = "clickk://onboarding-refresh";
const DEFAULT_RETURN_URL = "clickk://onboarding-complete";

const ALLOWED_REDIRECT_PREFIXES = [
  "clickk://",
  "https://ckrttngnwoslypyulwuf.supabase.co/functions/v1/stripe-redirect",
];

function isAllowedRedirect(url: string): boolean {
  if (typeof url !== "string") return false;
  return ALLOWED_REDIRECT_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function stripeRequest(path: string, key: string, body?: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body?.toString(),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "stripe_error");
  return json;
}

async function createAccountLink(key: string, accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const params = new URLSearchParams({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  const link = await stripeRequest("/account_links", key, params);
  return link.url as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email;

    // Read optional redirect URLs from request body
    let returnUrl = DEFAULT_RETURN_URL;
    let refreshUrl = DEFAULT_REFRESH_URL;
    try {
      const body = await req.json();
      if (body?.return_url && isAllowedRedirect(body.return_url)) returnUrl = body.return_url;
      if (body?.refresh_url && isAllowedRedirect(body.refresh_url)) refreshUrl = body.refresh_url;
    } catch { /* no body — use defaults */ }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("stripe_not_configured");

    const { data: existing, error: selectErr } = await supabase
      .from("seller_onboarding")
      .select("stripe_account_id, onboarding_url, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (selectErr) throw new Error(selectErr.message);

    if (existing) {
      if (existing.status === "complete") {
        return new Response(
          JSON.stringify({ error: "already_onboarded" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (existing.status === "pending" && existing.onboarding_url && existing.stripe_account_id) {
        const freshUrl = await createAccountLink(stripeKey, existing.stripe_account_id, returnUrl, refreshUrl);

        await supabase
          .from("seller_onboarding")
          .update({ onboarding_url: freshUrl, updated_at: new Date().toISOString() })
          .eq("user_id", userId);

        return new Response(
          JSON.stringify({ onboarding_url: freshUrl, status: existing.status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const accountParams = new URLSearchParams({
      type: "express",
      country: "CH",
      "capabilities[transfers][requested]": "true",
      "capabilities[card_payments][requested]": "true",
      "business_type": "individual",
    });
    if (userEmail) accountParams.set("email", userEmail);

    const account = await stripeRequest("/accounts", stripeKey, accountParams);
    const accountId = account.id as string;

    const onboardingUrl = await createAccountLink(stripeKey, accountId, returnUrl, refreshUrl);

    const { error: insertErr } = await supabase
      .from("seller_onboarding")
      .upsert(
        {
          user_id: userId,
          stripe_account_id: accountId,
          onboarding_url: onboardingUrl,
          status: "pending",
        },
        { onConflict: "user_id" }
      );

    if (insertErr) throw new Error(insertErr.message);

    return new Response(
      JSON.stringify({ onboarding_url: onboardingUrl, status: "pending" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
