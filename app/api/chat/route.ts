import { ZodError } from "zod";
import { engineConfig, prompt, safetyConfig } from "@/lib/config";
import { getProvider } from "@/lib/llm";
import { formatSources, retrieve } from "@/lib/rag/retrieve";
import type { Citation } from "@/lib/rag/types";
import { detectCrisis } from "@/lib/safety";
import { parseTranscript, userTurns } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Streams newline-delimited JSON events:
 *   {"type":"sources","sources":[Citation…]}   passages available to this reply
 *   {"type":"text","text":"…"}                 reply text, incrementally
 *   {"type":"crisis","text":"…"}               crisis resources; the model was not called
 *   {"type":"notice","text":"…"}               a non-error note for the user
 *   {"type":"error","text":"…"}
 *   {"type":"done"}
 */
export async function POST(req: Request) {
  let messages;
  try {
    messages = parseTranscript(await req.json());
  } catch (err) {
    const detail = err instanceof ZodError ? err.issues[0]?.message : "invalid JSON";
    return Response.json({ error: `Bad request: ${detail}` }, { status: 400 });
  }
  const config = engineConfig();
  const latest = messages[messages.length - 1];
  if (latest.role !== "user") return Response.json({ error: "Last message must be from the user" }, { status: 400 });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        if (detectCrisis(latest.content)) {
          send({ type: "crisis", text: safetyConfig().crisis_message });
          return;
        }
        if (userTurns(messages) > config.session.max_user_turns) {
          send({ type: "notice", text: "This session has reached its length limit. Create your reflection, or start a new session." });
          return;
        }

        // Search on the latest message plus the question it answers, so short replies ("yes, my mom") still find context.
        const previous = messages.length > 1 ? messages[messages.length - 2].content : "";
        let sources: Citation[] = [];
        try {
          sources = await retrieve(`${previous}\n\n${latest.content}`.trim());
        } catch (err) {
          // Research search being down shouldn't end the conversation; the prompt handles "no sources".
          console.error("[chat] retrieval failed:", err);
        }
        send({ type: "sources", sources });

        for await (const event of getProvider().streamReply({
          model: config.llm.chat_model,
          effort: config.llm.chat_effort,
          system: `${prompt("conversation")}\n\nThe session opened with this message from you:\n"${config.opening_message}"`,
          history: messages,
          context: formatSources(sources),
        })) {
          if (event.type === "text") send(event);
          else send({ type: "notice", text: "I wasn't able to respond to that. Could you put it another way?" });
        }
      } catch (err) {
        console.error("[chat] failed:", err);
        send({ type: "error", text: "Something went wrong on our end. Please try again in a moment." });
      } finally {
        send({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
