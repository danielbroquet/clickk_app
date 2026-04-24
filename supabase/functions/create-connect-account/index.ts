import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const REFRESH_URL = "clickk://onboarding-refresh";
const RETURN_URL = "clickk://onboarding-complete";

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

async function createAccountLink(key: string, accountId: string): Promise<string> {
  const params = new URLSearchParams({
    account: accountId,
    refresh_url: REFRESH_URL,
    return_url: RETURN_URL,
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
    const payload = JSON.parse(atob(token.split(".")[1])) as { sub?: string; email?: string };
    const userId = payload.sub;
    const userEmail = payload.email;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("stripe_not_configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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
        const freshUrl = await createAccountLink(stripeKey, existing.stripe_account_id);

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

    const onboardingUrl = await createAccountLink(stripeKey, accountId);

    const { error: insertErr } = await supabase
      .from("seller_onboarding")
      .insert({
        user_id: userId,
        stripe_account_id: accountId,
        onboarding_url: onboardingUrl,
        status: "pending",
      });

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
