// Shared helper — sends an Expo push notification to a single user.
// - Fetches push_token from profiles
// - Fires a POST to the Expo push API
// - Never throws: errors are logged only, so callers can fire-and-forget safely
//
// Usage:
//   await sendPushNotification(supabase, userId, "Title", "Body", { type: "..." })

export async function sendPushNotification(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    if (!userId) return;

    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("push_token")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[sendPushNotification] profile lookup failed:", error.message);
      return;
    }

    const token = profile?.push_token as string | null | undefined;
    if (!token) {
      // No token registered — silently skip
      return;
    }

    const payload = {
      to: token,
      title,
      body,
      data: data ?? {},
      sound: "default",
      priority: "high",
    };

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[sendPushNotification] Expo API returned ${res.status}: ${text.slice(0, 300)}`,
      );
      return;
    }

    const json = await res.json().catch(() => null);
    const ticket = json?.data;
    if (ticket?.status === "error") {
      console.error(
        `[sendPushNotification] Expo ticket error: ${ticket.message ?? "unknown"}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error(`[sendPushNotification] unexpected error: ${message}`);
  }
}
