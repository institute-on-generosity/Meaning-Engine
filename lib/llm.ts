/**
 * LLM calls: the streaming conversation reply and the structured end-of-session reflection.
 *
 * IoG's whole corpus is given to the model on every request (it is small enough), as documents
 * uploaded with the provider's file storage by `npm run corpus`. Prompt caching keeps the repeated
 * documents cheap.
 *
 * Provider-specific code lives in one class per provider. To add another provider, implement
 * ChatProvider (including how it receives the corpus) and register it in PROVIDERS, then set
 * `llm.provider` in config/engine.yaml.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { CitationTracker, type Citation } from "./citations";
import { engineConfig, type CorpusDoc } from "./config";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export type ReplyEvent =
  | { type: "text"; text: string }
  | { type: "citation"; citation: Citation }
  | { type: "declined" };

export interface ChatProvider {
  /** Stream the next assistant reply, citing the corpus documents it relies on. */
  streamReply(opts: {
    model: string;
    effort: Effort;
    system: string;
    history: Turn[];
    documents: CorpusDoc[];
  }): AsyncGenerator<ReplyEvent>;

  structured<T>(opts: {
    model: string;
    effort: Effort;
    system: string;
    prompt: string;
    documents: CorpusDoc[];
    schema: z.ZodType<T>;
  }): Promise<T>;
}

export class ModelDeclinedError extends Error {}

/** Models that accept server-side refusal fallbacks (Haiku doesn't). */
function fallbackParams(model: string) {
  return /^claude-(opus-5|sonnet-5-5|fable)/.test(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
}

const CACHE = { type: "ephemeral" } as const;

class AnthropicProvider implements ChatProvider {
  private client = new Anthropic(); // reads ANTHROPIC_API_KEY

  /**
   * The corpus as document blocks. They open the first user message, identical for every
   * session, so one cache entry serves everyone; the breakpoint sits on the last document.
   */
  private documentBlocks(documents: CorpusDoc[], citations: boolean): Anthropic.Beta.BetaRequestDocumentBlock[] {
    return documents.map((d, i) => ({
      type: "document",
      source: { type: "file", file_id: d.file_id },
      title: d.title,
      context: "Institute on Generosity (IoG)",
      citations: { enabled: citations },
      ...(i === documents.length - 1 ? { cache_control: CACHE } : {}),
    }));
  }

  async *streamReply({
    model,
    effort,
    system,
    history,
    documents,
  }: Parameters<ChatProvider["streamReply"]>[0]): AsyncGenerator<ReplyEvent> {
    const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t, i) => {
      const last = i === history.length - 1;
      // Cache breakpoint on the latest user message: next turn reuses everything up to here.
      const text: Anthropic.Beta.BetaTextBlockParam = { type: "text", text: t.content, ...(last ? { cache_control: CACHE } : {}) };
      if (i === 0) return { role: t.role, content: [...this.documentBlocks(documents, true), text] };
      return { role: t.role, content: last ? [text] : t.content };
    });

    const stream = this.client.beta.messages.stream({
      model,
      max_tokens: 16000,
      system: [{ type: "text", text: system, cache_control: CACHE }],
      messages,
      output_config: { effort },
      // If a safety classifier declines, the API retries on a suitable model in the same stream.
      ...fallbackParams(model),
    });

    // Citations arrive at the start of the text block they support; the tag goes after that block.
    const tracker = new CitationTracker();
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (event.delta.type === "citations_delta" && event.delta.citation.type === "char_location") {
          const c = event.delta.citation;
          const title = c.document_title ?? documents[c.document_index]?.title ?? "IoG Giving Guide";
          const fresh = tracker.cite(title, c.cited_text);
          if (fresh) yield { type: "citation", citation: fresh };
        }
      } else if (event.type === "content_block_stop") {
        const marker = tracker.marker();
        if (marker) yield { type: "text", text: marker };
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield { type: "declined" };
    const u = final.usage;
    console.info(
      `[chat] ${final.model}: ${u.input_tokens} in, ${u.cache_read_input_tokens ?? 0} cache read, ${u.cache_creation_input_tokens ?? 0} cache write / ${u.output_tokens} out`,
    );
  }

  async structured<T>({
    model,
    effort,
    system,
    prompt,
    documents,
    schema,
  }: {
    model: string;
    effort: Effort;
    system: string;
    prompt: string;
    documents: CorpusDoc[];
    schema: z.ZodType<T>;
  }): Promise<T> {
    // Citations can't be combined with structured output, so documents go in without them.
    const resp = await this.client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: [...this.documentBlocks(documents, false), { type: "text", text: prompt }] }],
      output_config: { effort, format: zodOutputFormat(schema) },
      ...fallbackParams(model),
    });
    if (resp.stop_reason === "refusal") throw new ModelDeclinedError(`${model} declined the request`);
    if (resp.stop_reason === "max_tokens") throw new Error(`${model} hit max_tokens; output truncated`);
    if (!resp.parsed_output) throw new Error(`${model} returned output that didn't match the schema`);
    console.info(`[reflection] ${resp.model}: ${resp.usage.input_tokens} in / ${resp.usage.output_tokens} out`);
    return resp.parsed_output as T;
  }

  /** Upload one document's text to Anthropic file storage; returns the file id. */
  async upload(name: string, text: string): Promise<string> {
    const file = await Anthropic.toFile(Buffer.from(text, "utf8"), name, { type: "text/plain" });
    return (await this.client.files.upload({ file })).id;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.client.files.delete(fileId);
  }

  async *listFiles(): AsyncGenerator<{ id: string; filename: string }> {
    for await (const f of this.client.files.list()) yield { id: f.id, filename: f.filename };
  }
}

const PROVIDERS: Record<string, () => ChatProvider> = {
  anthropic: () => new AnthropicProvider(),
};

let provider: ChatProvider | undefined;

export function getProvider(): ChatProvider {
  if (!provider) {
    const name = engineConfig().llm.provider;
    const make = PROVIDERS[name];
    if (!make) throw new Error(`Unknown LLM provider "${name}" in config/engine.yaml`);
    provider = make();
  }
  return provider;
}

/** File storage for the corpus upload script (Anthropic's Files API). */
export function corpusStorage() {
  return new AnthropicProvider();
}
