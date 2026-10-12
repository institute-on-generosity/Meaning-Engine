import { engineConfig } from "../config";
import { getEmbedder } from "../embeddings";
import { getStore } from "./store";
import type { Citation, ScoredChunk } from "./types";

/** Find research passages relevant to `query` and tag them S1, S2, … for this turn. */
export async function retrieve(query: string, k = engineConfig().retrieval.top_k): Promise<Citation[]> {
  const [embedding] = await getEmbedder().embed([query]);
  const hits = await getStore().search(embedding, k);
  return toCitations(hits, engineConfig().retrieval.min_similarity);
}

export function toCitations(hits: ScoredChunk[], minSimilarity: number): Citation[] {
  return hits
    .filter((h) => h.similarity >= minSimilarity)
    .map((h, i) => ({
      tag: `S${i + 1}`,
      title: h.title,
      publisher: h.publisher,
      url: h.url,
      page: h.page,
      excerpt: h.content,
    }));
}

/** Render passages for the model. */
export function formatSources(citations: Citation[]): string {
  if (citations.length === 0) {
    return "<research_sources>\nNo research passages matched this turn. Don't cite anything; respond from the conversation.\n</research_sources>";
  }
  const body = citations
    .map((c) => {
      const page = c.page ? `, p. ${c.page}` : "";
      return `<source id="${c.tag}" title="${c.title}${page}">\n${c.excerpt}\n</source>`;
    })
    .join("\n");
  return `<research_sources>\n${body}\n</research_sources>`;
}
