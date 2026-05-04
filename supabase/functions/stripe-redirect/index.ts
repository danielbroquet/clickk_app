import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Public endpoint — no JWT required.
// Stripe calls this URL after onboarding (return or refresh).
// We respond with an HTML page that deep-links back into the app.

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "complete"; // "complete" | "refresh"
  const deepLink = type === "refresh"
    ? "clickk://onboarding-refresh"
    : "clickk://onboarding-complete";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0; url=${deepLink}" />
  <title>Retour à clickk…</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f0f; color: #fff;
           display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    p { font-size: 16px; opacity: 0.7; }
    a { color: #00D2B8; }
  </style>
</head>
<body>
  <p>Retour à l'application… <a href="${deepLink}">Cliquez ici</a> si ça ne se fait pas automatiquement.</p>
  <script>window.location.href = "${deepLink}";</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
