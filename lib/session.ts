import { z } from "zod";
import { engineConfig } from "./config";
import type { Turn } from "./llm";

/** Validate a transcript sent by the browser. Throws a ZodError on bad input. */
export function parseTranscript(body: unknown): Turn[] {
  const { max_message_chars, max_user_turns } = engineConfig().session;
  const { messages } = z
    .object({
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(max_message_chars),
          }),
        )
        .min(1)
        .max(max_user_turns * 2),
    })
    .parse(body);
  if (messages[0].role !== "user") throw new z.ZodError([{ code: "custom", path: ["messages", 0], message: "First message must be from the user", input: messages[0] }]);
  return messages;
}

export function userTurns(messages: Turn[]): number {
  return messages.filter((m) => m.role === "user").length;
}
