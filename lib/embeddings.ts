/**
 * Text embeddings for research search. One class per provider; register new ones in PROVIDERS.
 * Changing the model or dimensions means re-running `npm run ingest` (and, for Supabase,
 * matching the vector column size).
 */
import OpenAI from "openai";
import { engineConfig } from "./config";

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

class OpenAIEmbedder implements Embedder {
  private client = new OpenAI(); // reads OPENAI_API_KEY
  constructor(private model: string, private dimensions: number) {}

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const resp = await this.client.embeddings.create({
        model: this.model,
        dimensions: this.dimensions,
        input: texts.slice(i, i + 100),
      });
      out.push(...resp.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
    return out;
  }
}

const PROVIDERS: Record<string, (model: string, dimensions: number) => Embedder> = {
  openai: (model, dimensions) => new OpenAIEmbedder(model, dimensions),
};

let embedder: Embedder | undefined;

export function getEmbedder(): Embedder {
  if (!embedder) {
    const { provider, model, dimensions } = engineConfig().embeddings;
    const make = PROVIDERS[provider];
    if (!make) throw new Error(`Unknown embeddings provider "${provider}" in config/engine.yaml`);
    embedder = make(model, dimensions);
  }
  return embedder;
}
