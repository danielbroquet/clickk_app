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

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
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

    // Only allow internal calls (service role key in Authorization header)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (token !== serviceRoleKey) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload: PushPayload = await req.json();
    const { user_id, title, body, data } = payload;

    if (!user_id || !title || !body) {
      return jsonResponse({ error: "invalid_params" }, 400);
    }

    // Fetch push token
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("push_token")
      .eq("id", user_id)
      .maybeSingle();

    if (profileErr) {
      return jsonResponse({ error: "profile_lookup_failed" }, 500);
    }

    const pushToken = profile?.push_token;
    if (!pushToken) {
      return jsonResponse({ success: true, skipped: true, reason: "no_push_token" });
    }

    // Send via Expo Push API
    const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        data: data ?? {},
        sound: "default",
      }),
    });

    const expoJson = await expoRes.json();

    if (!expoRes.ok) {
      return jsonResponse({ error: "expo_push_failed", details: expoJson }, 502);
    }

    return jsonResponse({ success: true, expo: expoJson });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    return jsonResponse({ error: message }, 500);
  }
});
