/**
 * Where research passages and their embeddings live.
 * - SupabaseStore (production): pgvector, used whenever SUPABASE_URL is set.
 * - LocalStore (development): data/index.json, searched in memory.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Chunk, ScoredChunk } from "./types";

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export interface VectorStore {
  readonly name: string;
  search(embedding: number[], k: number): Promise<ScoredChunk[]>;
  /** Replace the whole index with these chunks. */
  replaceAll(chunks: EmbeddedChunk[]): Promise<void>;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export class LocalStore implements VectorStore {
  readonly name = "local file (data/index.json)";
  private chunks: EmbeddedChunk[] | undefined;

  constructor(private file = path.join(process.cwd(), "data", "index.json")) {}

  private load(): EmbeddedChunk[] {
    if (!this.chunks) {
      if (!fs.existsSync(this.file)) {
        throw new Error("No research index found. Run `npm run ingest` first.");
      }
      this.chunks = JSON.parse(fs.readFileSync(this.file, "utf8")).chunks as EmbeddedChunk[];
    }
    return this.chunks;
  }

  async search(embedding: number[], k: number): Promise<ScoredChunk[]> {
    return this.load()
      .map(({ embedding: e, ...chunk }) => ({ ...chunk, similarity: cosine(embedding, e) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  async replaceAll(chunks: EmbeddedChunk[]): Promise<void> {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ builtAt: new Date().toISOString(), chunks }));
    this.chunks = chunks;
  }
}

interface ChunkRow {
  id: string;
  source_id: string;
  title: string;
  publisher: string;
  url: string | null;
  page: number | null;
  content: string;
  similarity: number;
}

export class SupabaseStore implements VectorStore {
  readonly name = "Supabase pgvector";
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async search(embedding: number[], k: number): Promise<ScoredChunk[]> {
    const { data, error } = await this.db.rpc("match_corpus_chunks", {
      query_embedding: embedding,
      match_count: k,
    });
    if (error) throw new Error(`Supabase search failed: ${error.message}`);
    return (data as ChunkRow[]).map((r) => ({
      id: r.id,
      sourceId: r.source_id,
      title: r.title,
      publisher: r.publisher,
      url: r.url,
      page: r.page,
      content: r.content,
      similarity: r.similarity,
    }));
  }

  async replaceAll(chunks: EmbeddedChunk[]): Promise<void> {
    // Upsert the new set first so search keeps working during ingest, then remove stale rows.
    for (let i = 0; i < chunks.length; i += 200) {
      const rows = chunks.slice(i, i + 200).map((c) => ({
        id: c.id,
        source_id: c.sourceId,
        title: c.title,
        publisher: c.publisher,
        url: c.url,
        page: c.page,
        content: c.content,
        embedding: c.embedding,
      }));
      const { error } = await this.db.from("corpus_chunks").upsert(rows);
      if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
    }
    const keep = new Set(chunks.map((c) => c.id));
    const { data, error } = await this.db.from("corpus_chunks").select("id");
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    const stale = (data as { id: string }[]).map((r) => r.id).filter((id) => !keep.has(id));
    for (let i = 0; i < stale.length; i += 200) {
      const { error: delError } = await this.db.from("corpus_chunks").delete().in("id", stale.slice(i, i + 200));
      if (delError) throw new Error(`Supabase delete failed: ${delError.message}`);
    }
  }
}

let store: VectorStore | undefined;

export function getStore(): VectorStore {
  if (!store) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    store = url && key ? new SupabaseStore(url, key) : new LocalStore();
  }
  return store;
}
