import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { corpus, prompt, type CorpusDoc } from "./config";

const Advisor = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "advisor ids use lowercase letters, digits and hyphens"),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  opening_message: z.string(),
  reflection_label: z.string(), // what the end-of-session document is called, e.g. "giving plan"
  button_label: z.string(), // e.g. "Create my giving plan"
  guides: z.array(z.string()).min(1), // corpus sources, e.g. "iog/ecosystem-mapping.docx"
  focus: z.string(),
});
export type Advisor = z.infer<typeof Advisor>;

/** What the browser needs to show an advisor. */
export interface AdvisorSummary {
  id: string;
  name: string;
  tagline: string;
  description: string;
  opening: string;
  buttonLabel: string;
  reflectionLabel: string;
}

let cache: Advisor[] | undefined;

/** GuideGPT's advisors, from config/advisors.yaml. The first is the default. */
export function advisors(): Advisor[] {
  if (!cache) {
    // Literal path so Next.js bundles exactly this file for deployment.
    const file = fs.readFileSync(path.join(process.cwd(), "config", "advisors.yaml"), "utf8");
    const list = z.object({ advisors: z.array(Advisor).min(1) }).parse(parse(file)).advisors;
    const ids = new Set<string>();
    for (const a of list) {
      if (ids.has(a.id)) throw new Error(`config/advisors.yaml: advisor id "${a.id}" is used twice`);
      ids.add(a.id);
    }
    cache = list;
  }
  return cache;
}

/** The advisor with this id, or the default one for anything else (missing, unknown, not a string). */
export function advisorFor(id: unknown): Advisor {
  const list = advisors();
  return list.find((a) => a.id === id) ?? list[0];
}

/** The Giving Guides this advisor reads, in the order listed. Fails loudly on a guide that isn't uploaded. */
export function advisorDocuments(a: Advisor): CorpusDoc[] {
  const bySource = new Map(corpus().map((d) => [d.source, d]));
  return a.guides.map((source) => {
    const doc = bySource.get(source);
    if (!doc) throw new Error(`Advisor "${a.id}" lists ${source}, which isn't in config/corpus.json. Run \`npm run corpus\`?`);
    return doc;
  });
}

export function advisorSummary(a: Advisor): AdvisorSummary {
  return {
    id: a.id,
    name: a.name,
    tagline: a.tagline,
    description: a.description,
    opening: a.opening_message,
    buttonLabel: a.button_label,
    reflectionLabel: a.reflection_label,
  };
}

/** Guide titles for an advisor, as a readable list. */
function guideTitles(a: Advisor): string {
  return advisorDocuments(a)
    .map((d) => d.title)
    .join("; ");
}

/** The conversation instructions: the shared prompt plus this advisor's focus and guides. */
export function conversationSystem(a: Advisor): string {
  const others = advisors().filter((o) => o.id !== a.id);
  return [
    prompt("conversation"),
    `## This advisor\n\n${a.focus.trim()}`,
    `Your guides for this conversation are: ${guideTitles(a)}. When you draw on one, name it by its title (for example "IoG's guide on ecosystem mapping"), and only name the guide you are actually quoting.`,
    others.length
      ? `GuideGPT's other advisors read other guides:\n${others.map((o) => `- ${o.name} (${o.tagline}): ${guideTitles(o)}`).join("\n")}\nIf someone asks about a guide or topic that belongs to another advisor, say which advisor covers it and that they can switch with "Start over", then keep helping within your own focus.`
      : "",
    `After about six to ten exchanges, or when the conversation reaches a natural resting point, mention that they can create their ${a.reflection_label} with the "${a.button_label}" button.`,
    `The session opened with this message from you:\n"${a.opening_message.trim()}"`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The end-of-session document's instructions, framed for this advisor. */
export function reflectionSystem(a: Advisor): string {
  return [
    prompt("reflection"),
    `This session was with GuideGPT's ${a.name}. The page is already headed "Your ${a.reflection_label}", so give it a short personal title that doesn't repeat those words. Make the practices concrete next steps that fit this advisor's focus.`,
  ].join("\n\n");
}
