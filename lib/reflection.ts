import { z } from "zod";
import { engineConfig, prompt } from "./config";
import { getProvider, type Turn } from "./llm";
import { formatSources, retrieve } from "./rag/retrieve";
import type { Citation } from "./rag/types";

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
        source_ids: z.array(z.string()).describe("Ids of research passages this draws on, e.g. ['S2'], or []."),
      }),
    )
    .describe("1-3 practices."),
  questions_to_keep: z.array(z.string()).describe("2-3 open questions to keep reflecting on."),
});
export type ReflectionDraft = z.infer<typeof ReflectionSchema>;

export interface Reflection extends Omit<ReflectionDraft, "practices"> {
  practices: (Omit<ReflectionDraft["practices"][number], "source_ids"> & { sources: Citation[] })[];
  createdAt: string;
}

export async function createReflection(messages: Turn[]): Promise<Reflection> {
  const config = engineConfig();
  const said = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
  const sources = await retrieve(said, 8).catch((err) => {
    console.error("[reflection] retrieval failed:", err);
    return [] as Citation[];
  });
  const transcript = messages
    .map((m) => `<${m.role === "user" ? "person" : "meaning_engine"}>\n${m.content}\n</${m.role === "user" ? "person" : "meaning_engine"}>`)
    .join("\n");

  const draft = await getProvider().structured({
    model: config.llm.reflection_model,
    effort: config.llm.reflection_effort,
    system: prompt("reflection"),
    prompt: `${formatSources(sources)}\n\n<conversation>\n${transcript}\n</conversation>\n\nWrite this person's giving reflection.`,
    schema: ReflectionSchema,
  });

  // Citations come from the retrieved passages, never from the model: unknown ids are dropped.
  const byTag = new Map(sources.map((s) => [s.tag, s]));
  return {
    ...draft,
    practices: draft.practices.map(({ source_ids, ...p }) => ({
      ...p,
      sources: source_ids.flatMap((id) => byTag.get(id) ?? []),
    })),
    createdAt: new Date().toISOString(),
  };
}
