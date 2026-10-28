import { z, ZodError } from "zod";
import { recordEvent, modeOf } from "@/lib/events";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";

const Feedback = z.object({
  rating: z.enum(["insightful", "useful", "neutral", "not_useful"]),
  comment: z.string().trim().max(1000).default(""),
  turns: z.number().int().min(0).max(200),
});

/** Post-session survey answer. Anonymous: a rating, an optional comment, and the session length. */
export async function POST(req: Request) {
  const blocked = guard(req, "feedback", 20, 60 * 60_000);
  if (blocked) return blocked;
  let body: unknown;
  let data: z.infer<typeof Feedback>;
  try {
    body = await req.json();
    data = Feedback.parse(body);
  } catch (err) {
    const detail = err instanceof ZodError ? err.issues[0]?.message : "invalid JSON";
    return Response.json({ error: `Bad request: ${detail}` }, { status: 400 });
  }
  await recordEvent({ type: "survey", mode: modeOf(body), ...data });
  return new Response(null, { status: 204 });
}
