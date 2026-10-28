/**
 * Cheap protections for the public API routes.
 *
 * The rate limit is kept in memory, so on a serverless host each running instance counts on its
 * own. It stops one visitor (or script) from hammering the site, but it isn't an exact global
 * limit. The hard backstop for cost is a monthly spend limit on the Anthropic workspace (see docs).
 */

const hits = new Map<string, number[]>();

/** Sliding-window limit: at most `limit` calls per `windowMs` for `key`. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    // Forget idle visitors so memory stays bounded.
    for (const [k, times] of hits) if (now - times[times.length - 1] >= windowMs) hits.delete(k);
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** The visitor's IP as reported by the hosting proxy, or "local" in development. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/**
 * True if the request came from a page on this same site. Browsers always send Origin on these
 * POSTs; requiring it keeps other sites and scripts from using the API as a free Claude endpoint.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/** A JSON error response for a blocked request, or null if the request may proceed. */
export function guard(req: Request, bucket: string, limit: number, windowMs: number): Response | null {
  if (!sameOrigin(req)) return Response.json({ error: "Requests must come from the MeaningEngine site." }, { status: 403 });
  const { ok, retryAfterSeconds } = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs);
  if (!ok) {
    return Response.json(
      { error: "Lots of activity from your network right now. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }
  return null;
}
