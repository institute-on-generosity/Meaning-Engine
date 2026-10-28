import { z } from "zod";
import { corpus, engineConfig, prompt } from "./config";
import { getProvider, type Turn, type Usage } from "./llm";

export const ReflectionSchema = z.object({
  title: z.string().describe("A short, personal title for this reflection, under 60 characters."),
  summary: z
    .string()
    .describe("2 short paragraphs, to the person as 'you': what they explored and what seemed to matter most."),
  values: z
    .array(z.object({ value: z.string(), evidence: z.string().describe("What they said that shows this.") }))
    .describe("2-4 values that came through in their giving."),
  practices: z
    .array(
      z.object({
        practice: z.string().describe("A small, concrete thing to try."),
        why: z.string().describe("Why it fits this person, in a sentence or two."),
        guides: z
          .array(z.string())
          .describe("Exact titles of the guides whose cited passages this practice builds on, or []."),
      }),
    )
    .describe("1-3 practices."),
  questions_to_keep: z.array(z.string()).describe("2-3 open questions to keep reflecting on."),
});
export type ReflectionDraft = z.infer<typeof ReflectionSchema>;

export interface Reflection extends ReflectionDraft {
  createdAt: string;
}

/** A passage MeaningEngine cited during the conversation (sent back by the browser). */
export const CitedPassage = z.object({ title: z.string().max(200), quote: z.string().max(800) });
export type CitedPassage = z.infer<typeof CitedPassage>;
export const CitedPassages = z.array(CitedPassage).max(40);

/**
 * Write the end-of-session reflection. It works from the conversation plus the passages already
 * cited in it, not the whole corpus: that keeps it grounded in what the person actually saw, and
 * avoids sending ~150k tokens of guides a second time.
 */
export async function createReflection(
  messages: Turn[],
  cited: CitedPassage[],
  options: { model?: string; onUsage?: (usage: Usage) => void } = {},
): Promise<Reflection> {
  const config = engineConfig();
  // Only passages from real guides count; a browser can send anything.
  const byTitle = new Map(corpus().map((d) => [d.title.toLowerCase(), d.title]));
  const passages = cited.flatMap((c) => {
    const title = byTitle.get(c.title.trim().toLowerCase());
    return title ? [{ title, quote: c.quote.trim() }] : [];
  });
  const transcript = messages
    .map((m) => {
      const who = m.role === "user" ? "person" : "meaning_engine";
      return `<${who}>\n${m.content}\n</${who}>`;
    })
    .join("\n");
  const sources = passages.length
    ? passages.map((p) => `<passage guide="${p.title}">\n${p.quote}\n</passage>`).join("\n")
    : "No passages were cited in this conversation.";

  const draft = await getProvider().structured({
    model: options.model ?? config.llm.reflection_model,
    effort: config.llm.reflection_effort,
    system: prompt("reflection"),
    prompt: `<cited_passages>\n${sources}\n</cited_passages>\n\n<conversation>\n${transcript}\n</conversation>\n\nWrite this person's giving reflection.`,
    documents: [],
    schema: ReflectionSchema,
    onUsage: options.onUsage,
  });

  // A practice may name only guides whose passages were actually cited.
  const citedTitles = new Map(passages.map((p) => [p.title.toLowerCase(), p.title]));
  return {
    ...draft,
    practices: draft.practices.map((p) => ({
      ...p,
      guides: [...new Set(p.guides.flatMap((g) => citedTitles.get(g.trim().toLowerCase()) ?? []))],
    })),
    createdAt: new Date().toISOString(),
  };
}
