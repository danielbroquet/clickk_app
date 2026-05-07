import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "supabase_not_configured" }, 500);
    }
    if (!geminiApiKey) {
      return jsonResponse({ error: "gemini_not_configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { story_id } = await req.json();
    if (!story_id) {
      return jsonResponse({ error: "missing_story_id" }, 400);
    }

    // 1. Fetch story
    const { data: story, error: storyErr } = await admin
      .from("stories")
      .select("thumbnail_url, seller_id")
      .eq("id", story_id)
      .maybeSingle();

    if (storyErr || !story) {
      return jsonResponse({ error: "story_not_found" }, 404);
    }

    const { thumbnail_url, seller_id } = story;
    if (!thumbnail_url) {
      return jsonResponse({ error: "no_thumbnail" }, 400);
    }

    // 2. Download thumbnail and convert to base64
    const imageRes = await fetch(thumbnail_url);
    if (!imageRes.ok) {
      return jsonResponse({ error: "thumbnail_download_failed" }, 502);
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = btoa(
      String.fromCharCode(...new Uint8Array(imageBuffer))
    );
    const mimeType = imageRes.headers.get("content-type") || "image/jpeg";

    // 3. Call Gemini 2.5 Flash API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${geminiApiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
              {
                text: 'Analyze this marketplace product image. Is it appropriate for a Swiss general marketplace app (no nudity, no violence, no weapons, no shocking content)? Respond only with JSON: { "approved": boolean, "reason": string }',
              },
            ],
          },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      return jsonResponse(
        { error: "gemini_api_error", details: errBody },
        502
      );
    }

    const geminiData = await geminiRes.json();
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // 4. Parse Gemini response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return jsonResponse({ error: "gemini_parse_error", raw: rawText }, 502);
    }

    const moderation = JSON.parse(jsonMatch[0]) as {
      approved: boolean;
      reason: string;
    };

    if (moderation.approved) {
      await admin
        .from("stories")
        .update({ moderation_status: "approved" })
        .eq("id", story_id);

      return jsonResponse({
        success: true,
        moderation_status: "approved",
      });
    }

    // Flagged: set to draft and notify seller
    await admin
      .from("stories")
      .update({ moderation_status: "flagged", status: "draft" })
      .eq("id", story_id);

    // Notify seller via send-push
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        user_id: seller_id,
        title: "Drop refus\u00e9",
        body: moderation.reason,
        data: { type: "moderation_flagged", story_id },
      }),
    });

    return jsonResponse({
      success: true,
      moderation_status: "flagged",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    return jsonResponse({ error: message }, 500);
  }
});
