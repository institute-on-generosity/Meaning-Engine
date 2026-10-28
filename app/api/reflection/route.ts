import { ZodError } from "zod";
import { engineConfig } from "@/lib/config";
import { ModelDeclinedError } from "@/lib/llm";
import { CitedPassages, createReflection, type CitedPassage } from "@/lib/reflection";
import { modeOf, recordEvent } from "@/lib/events";
import { guard } from "@/lib/guard";
import { parseTranscript, userTurns } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const blocked = guard(req, "reflection", engineConfig().limits.reflections_per_ip_per_hour, 60 * 60_000);
  if (blocked) return blocked;

  let messages;
  let cited: CitedPassage[];
  let body: unknown;
  try {
    body = await req.json();
    messages = parseTranscript(body);
    cited = CitedPassages.parse((body as { cited?: unknown }).cited ?? []);
  } catch (err) {
    const detail = err instanceof ZodError ? err.issues[0]?.message : "invalid JSON";
    return Response.json({ error: `Bad request: ${detail}` }, { status: 400 });
  }
  if (userTurns(messages) < engineConfig().session.reflection_after_turns) {
    return Response.json({ error: "Talk a little longer before creating a reflection." }, { status: 400 });
  }
  try {
    const reflection = await createReflection(messages, cited);
    await recordEvent({
      type: "reflection_created",
      mode: modeOf(body),
      turns: userTurns(messages),
      model: engineConfig().llm.reflection_model,
    });
    return Response.json(reflection);
  } catch (err) {
    console.error("[reflection] failed:", err);
    const text =
      err instanceof ModelDeclinedError
        ? "I wasn't able to write a reflection for this conversation."
        : "Something went wrong creating your reflection. Please try again.";
    return Response.json({ error: text }, { status: 502 });
  }
}
