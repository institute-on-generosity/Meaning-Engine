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
          .describe("Exact titles of the IoG documents this practice draws on, as given in the document titles, or []."),
      }),
    )
    .describe("1-3 practices."),
  questions_to_keep: z.array(z.string()).describe("2-3 open questions to keep reflecting on."),
});
export type ReflectionDraft = z.infer<typeof ReflectionSchema>;

export interface Reflection extends ReflectionDraft {
  createdAt: string;
}

export async function createReflection(
  messages: Turn[],
  options: { model?: string; onUsage?: (usage: Usage) => void } = {},
): Promise<Reflection> {
  const config = engineConfig();
  const documents = corpus();
  const transcript = messages
    .map((m) => {
      const who = m.role === "user" ? "person" : "meaning_engine";
      return `<${who}>\n${m.content}\n</${who}>`;
    })
    .join("\n");

  const draft = await getProvider().structured({
    model: options.model ?? config.llm.reflection_model,
    effort: config.llm.reflection_effort,
    system: prompt("reflection"),
    prompt: `<conversation>\n${transcript}\n</conversation>\n\nWrite this person's giving reflection.`,
    documents,
    schema: ReflectionSchema,
    onUsage: options.onUsage,
  });

  // Guide titles come from the corpus, never from the model: anything that isn't a real title is dropped.
  const byTitle = new Map(documents.map((d) => [d.title.toLowerCase(), d.title]));
  return {
    ...draft,
    practices: draft.practices.map((p) => ({
      ...p,
      guides: [...new Set(p.guides.flatMap((g) => byTitle.get(g.trim().toLowerCase()) ?? []))],
    })),
    createdAt: new Date().toISOString(),
  };
}
