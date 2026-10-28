/**
 * Anonymous usage events for the success metrics: sessions started, reflections created, and
 * post-session survey answers. No conversation text is ever included.
 *
 * Every event is printed to the server log. If FEEDBACK_WEBHOOK_URL is set, it is also POSTed there
 * as JSON (for example to a Google Apps Script that appends rows to a Sheet; see docs/staff-guide.md).
 */
export type Mode = "web" | "kiosk";

export type UsageEvent =
  | { type: "session_started"; mode: Mode }
  | { type: "reflection_created"; mode: Mode; turns: number; model: string }
  | { type: "survey"; mode: Mode; rating: "insightful" | "useful" | "neutral" | "not_useful"; comment: string; turns: number };

export async function recordEvent(event: UsageEvent): Promise<void> {
  const row = { ...event, at: new Date().toISOString() };
  console.info("[event]", JSON.stringify(row));
  const url = process.env.FEEDBACK_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.error(`[event] webhook returned ${res.status}`);
  } catch (err) {
    // Recording a metric must never break the visitor's session.
    console.error("[event] webhook failed:", err instanceof Error ? err.message : err);
  }
}

export function modeOf(body: unknown): Mode {
  return (body as { mode?: unknown } | null)?.mode === "kiosk" ? "kiosk" : "web";
}
