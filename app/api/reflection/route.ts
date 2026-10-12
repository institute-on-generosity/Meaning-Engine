import { ZodError } from "zod";
import { engineConfig } from "@/lib/config";
import { ModelDeclinedError } from "@/lib/llm";
import { createReflection } from "@/lib/reflection";
import { parseTranscript, userTurns } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let messages;
  try {
    messages = parseTranscript(await req.json());
  } catch (err) {
    const detail = err instanceof ZodError ? err.issues[0]?.message : "invalid JSON";
    return Response.json({ error: `Bad request: ${detail}` }, { status: 400 });
  }
  if (userTurns(messages) < engineConfig().session.reflection_after_turns) {
    return Response.json({ error: "Talk a little longer before creating a reflection." }, { status: 400 });
  }
  try {
    return Response.json(await createReflection(messages));
  } catch (err) {
    console.error("[reflection] failed:", err);
    const text =
      err instanceof ModelDeclinedError
        ? "I wasn't able to write a reflection for this conversation."
        : "Something went wrong creating your reflection. Please try again.";
    return Response.json({ error: text }, { status: 502 });
  }
}
