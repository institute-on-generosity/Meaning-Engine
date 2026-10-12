// Shared by the server and the browser: keep this file free of Node imports.

/** A passage from one of IoG's documents that a reply relies on. */
export interface Citation {
  tag: string; // "S1", "S2", … within one reply
  title: string;
  quote: string;
}

/** Tags cited in reply text, like [S1] or [S1, S3], in order of first appearance. */
export function citedTags(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/\[(S\d+(?:\s*,\s*S\d+)*)\]/g)) {
    for (const tag of m[1].split(/\s*,\s*/)) seen.add(tag);
  }
  return [...seen];
}

/**
 * Numbers the passages cited in one reply. The same passage cited twice keeps its tag, and
 * `marker()` returns the inline tag text for the citations collected since the last call.
 */
export class CitationTracker {
  private tags = new Map<string, string>();
  private pending: string[] = [];

  /** Record a citation; returns it if this passage is new to the reply, else null. */
  cite(title: string, quote: string): Citation | null {
    const clean = quote.replace(/\s+/g, " ").trim();
    const key = `${title}\u0000${clean}`;
    let tag = this.tags.get(key);
    let fresh: Citation | null = null;
    if (!tag) {
      tag = `S${this.tags.size + 1}`;
      this.tags.set(key, tag);
      fresh = { tag, title, quote: clean };
    }
    if (!this.pending.includes(tag)) this.pending.push(tag);
    return fresh;
  }

  marker(): string {
    if (this.pending.length === 0) return "";
    const text = ` [${this.pending.join(", ")}]`;
    this.pending = [];
    return text;
  }
}
