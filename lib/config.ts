import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import corpusManifest from "../config/corpus.json";

const EngineConfig = z.object({
  llm: z.object({
    provider: z.string(),
    chat_model: z.string(),
    chat_effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
    reflection_model: z.string(),
    reflection_effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  }),
  limits: z.object({
    chat_per_ip_per_10_min: z.number().int().positive(),
    reflections_per_ip_per_hour: z.number().int().positive(),
  }),
  kiosk: z.object({
    idle_seconds: z.number().int().positive(),
    warning_seconds: z.number().int().positive(),
  }),
  session: z.object({
    max_user_turns: z.number().int().positive(),
    max_message_chars: z.number().int().positive(),
    reflection_after_turns: z.number().int().positive(),
  }),
  opening_message: z.string(),
});
export type EngineConfig = z.infer<typeof EngineConfig>;

const SafetyConfig = z.object({
  crisis_phrases: z.array(z.string()).min(1),
  crisis_message: z.string(),
});
export type SafetyConfig = z.infer<typeof SafetyConfig>;

// Paths are spelled out literally so Next.js bundles exactly these files for deployment.
const FILES = {
  engine: () => path.join(process.cwd(), "config", "engine.yaml"),
  safety: () => path.join(process.cwd(), "config", "safety.yaml"),
  conversation: () => path.join(process.cwd(), "prompts", "conversation.md"),
  reflection: () => path.join(process.cwd(), "prompts", "reflection.md"),
};

function readYaml<T>(file: string, schema: z.ZodType<T>): T {
  return schema.parse(parse(fs.readFileSync(file, "utf8")));
}

let engine: EngineConfig | undefined;
let safety: SafetyConfig | undefined;
const prompts = new Map<string, string>();

export function engineConfig(): EngineConfig {
  return (engine ??= readYaml(FILES.engine(), EngineConfig));
}

export function safetyConfig(): SafetyConfig {
  return (safety ??= readYaml(FILES.safety(), SafetyConfig));
}

export function prompt(name: "conversation" | "reflection"): string {
  let text = prompts.get(name);
  if (text === undefined) {
    const file = name === "conversation" ? FILES.conversation() : FILES.reflection();
    text = fs.readFileSync(file, "utf8").trim();
    prompts.set(name, text);
  }
  return text;
}

const CorpusManifest = z.object({
  documents: z.array(
    z.object({
      title: z.string(),
      source: z.string(), // path under corpus/
      file_id: z.string(), // Anthropic Files API id
      sha256: z.string(), // of the uploaded text, so unchanged documents aren't re-uploaded
      chars: z.number().int(),
    }),
  ),
});
export type CorpusDoc = z.infer<typeof CorpusManifest>["documents"][number];

let corpusDocs: CorpusDoc[] | undefined;

/** IoG's documents, as uploaded by `npm run corpus` (bundled at build time). */
export function corpus(): CorpusDoc[] {
  if (!corpusDocs) {
    const docs = CorpusManifest.parse(corpusManifest).documents;
    if (docs.length === 0) throw new Error("No corpus uploaded yet. Run `npm run corpus`.");
    corpusDocs = docs;
  }
  return corpusDocs;
}
