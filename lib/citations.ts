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
 * A passage cited from the top of a guide, or the top of a section, starts with the guide's
 * title or an all-caps heading on its own line ("OVERVIEW"). Drop those so the quote is the prose.
 */
export function dropLeadingHeadings(quote: string, title: string): string {
  const lines = quote.trim().split(/\n+/);
  // Footnote markers ("Giving Guide: Policy Advocacy[1]") don't stop a line from being the title.
  const isHeading = (line: string) => {
    const bare = line.replace(/\[\d+\]/g, "").trim();
    return bare === title || !/[a-z]/.test(bare);
  };
  while (lines.length > 1 && isHeading(lines[0])) lines.shift();
  return lines.join("\n");
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
    const clean = dropLeadingHeadings(quote, title).replace(/\s+/g, " ").trim();
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

const TAG = /\s?\[S\d+(?:\s*,\s*S\d+)*\]/g;

/** Remove [S1]-style tags, e.g. from earlier replies before they go back to the model as history. */
export function stripTags(text: string): string {
  return text.replace(TAG, "");
}

/**
 * Drops [S1]-style tags the model types itself while its reply streams in chunk by chunk. Only
 * tags added by CitationTracker (backed by a real citation) should reach the reader. Text that
 * might be the start of a tag is held back until it's clear either way.
 */
export class TagFilter {
  private held = "";

  push(chunk: string): string {
    const text = this.held + chunk;
    const open = text.lastIndexOf("[");
    // Hold back a trailing "[S1, S" that could still become a tag (or a space just before one).
    if (open >= 0 && /^\[(S(\d+(\s*,\s*(S\d*)?)*)?)?$/.test(text.slice(open))) {
      const start = open > 0 && /\s/.test(text[open - 1]) ? open - 1 : open;
      this.held = text.slice(start);
      return stripTags(text.slice(0, start));
    }
    this.held = "";
    return stripTags(text);
  }

  /** End of a text block: release anything held back (it wasn't a tag). */
  flush(): string {
    const rest = stripTags(this.held);
    this.held = "";
    return rest;
  }
}

/**
 * A short opening sentence that only grades the person's message ("That's a useful thing to
 * name.", "That's a fair thing to want.", "Thanks for saying that plainly."). Models write these
 * despite instructions; they add nothing, so the first one in a reply is dropped.
 */
const FILLER_OPENING =
  /^\s*(?:(?:that|this|it)(?:'s| is| was) (?:a |an )?(?:really |very |such a |completely |totally )?(?:useful|fair|good|great|honest|important|common|natural|understandable|real|helpful|thoughtful|interesting|reasonable|valid|powerful|brave)(?: (?:thing|question|point|place|instinct|observation|insight|shift|reaction|feeling|way to (?:put|see) it))?(?: to (?:name|want|ask|notice|say|feel|wonder|land|be|have|hear))?(?: about)?|thanks? (?:you )?for (?:saying|sharing|naming|telling me) (?:that|this)(?: (?:so )?(?:plainly|honestly|openly|directly))?|what a (?:good|great|thoughtful|beautiful) question)[.!]\s+/i;

/** Drops one filler opening sentence (see FILLER_OPENING) from the start of a reply. */
export function dropFillerOpening(text: string): string {
  return text.replace(FILLER_OPENING, "");
}

/**
 * Applies dropFillerOpening to a reply while it streams: holds back the start of the reply
 * until its first sentence is complete (or clearly long), then releases everything after it.
 */
export class OpeningFilter {
  private held = "";
  private done = false;

  push(chunk: string): string {
    if (this.done) return chunk;
    this.held += chunk;
    // Decide once the first sentence has ended and something follows it, or once the opening
    // is too long to be filler.
    const ended = /[.!]\s+\S/.test(this.held);
    if (!ended && this.held.length < 120) return "";
    this.done = true;
    const out = dropFillerOpening(this.held);
    this.held = "";
    return out;
  }

  /** End of the reply's first text block: release whatever is held. */
  flush(): string {
    if (this.done) return "";
    this.done = true;
    const out = this.held;
    this.held = "";
    return out;
  }
}
