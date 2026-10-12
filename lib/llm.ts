/**
 * LLM calls: the streaming conversation reply and the structured end-of-session reflection.
 *
 * Provider-specific code lives in one class per provider. To add another provider, implement
 * ChatProvider and register it in PROVIDERS, then set `llm.provider` in config/engine.yaml.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { engineConfig } from "./config";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export type ReplyEvent = { type: "text"; text: string } | { type: "declined" };

export interface ChatProvider {
  /**
   * Stream the next assistant reply. `context` (this turn's research passages) is given to the
   * model after the latest user message and is not kept in later turns' history.
   */
  streamReply(opts: {
    model: string;
    effort: Effort;
    system: string;
    history: Turn[];
    context: string;
  }): AsyncGenerator<ReplyEvent>;

  structured<T>(opts: {
    model: string;
    effort: Effort;
    system: string;
    prompt: string;
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

class AnthropicProvider implements ChatProvider {
  private client = new Anthropic(); // reads ANTHROPIC_API_KEY

  async *streamReply({
    model,
    effort,
    system,
    history,
    context,
  }: Parameters<ChatProvider["streamReply"]>[0]): AsyncGenerator<ReplyEvent> {
    const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t, i) => ({
      role: t.role,
      // Cache breakpoint on the latest user message: next turn reuses everything up to here.
      content:
        i === history.length - 1
          ? [{ type: "text" as const, text: t.content, cache_control: { type: "ephemeral" as const } }]
          : t.content,
    }));
    // Research passages go in a mid-conversation system message after the latest user turn,
    // so they carry operator authority (not user text) and don't disturb the cached history.
    messages.push({ role: "system", content: context });

    const stream = this.client.beta.messages.stream({
      model,
      max_tokens: 16000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      output_config: { effort },
      // If a safety classifier declines, the API retries on a suitable model in the same stream.
      ...fallbackParams(model),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield { type: "declined" };
    console.info(
      `[chat] ${final.model}: ${final.usage.input_tokens} in (+${final.usage.cache_read_input_tokens ?? 0} cached) / ${final.usage.output_tokens} out`,
    );
  }

  async structured<T>({
    model,
    effort,
    system,
    prompt,
    schema,
  }: {
    model: string;
    effort: Effort;
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const resp = await this.client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort, format: zodOutputFormat(schema) },
      ...fallbackParams(model),
    });
    if (resp.stop_reason === "refusal") throw new ModelDeclinedError(`${model} declined the request`);
    if (resp.stop_reason === "max_tokens") throw new Error(`${model} hit max_tokens; output truncated`);
    if (!resp.parsed_output) throw new Error(`${model} returned output that didn't match the schema`);
    console.info(`[reflection] ${resp.model}: ${resp.usage.input_tokens} in / ${resp.usage.output_tokens} out`);
    return resp.parsed_output as T;
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
