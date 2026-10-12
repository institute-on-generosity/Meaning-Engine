/** One passage of a research document, as stored in the vector index. */
export interface Chunk {
  id: string; // `${sourceId}#${n}`
  sourceId: string; // path under corpus/, e.g. "iog/report.pdf"
  title: string;
  publisher: string;
  url: string | null;
  page: number | null; // first page the passage comes from (PDFs only)
  content: string;
}

export interface ScoredChunk extends Chunk {
  similarity: number;
}

/** A passage as shown to the model and the user, with its per-turn tag (S1, S2, …). */
export interface Citation {
  tag: string;
  title: string;
  publisher: string;
  url: string | null;
  page: number | null;
  excerpt: string;
}
