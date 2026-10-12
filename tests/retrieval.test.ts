import { describe, expect, it } from "vitest";
import { citedTags } from "@/lib/citations";
import { formatSources, toCitations } from "@/lib/rag/retrieve";
import { cosine } from "@/lib/rag/store";
import type { ScoredChunk } from "@/lib/rag/types";

const hit = (id: string, similarity: number): ScoredChunk => ({
  id,
  sourceId: id,
  title: `Title ${id}`,
  publisher: "Institute on Generosity",
  url: null,
  page: 3,
  content: `Content ${id}`,
  similarity,
});

describe("retrieval helpers", () => {
  it("drops weak matches and tags the rest in order", () => {
    const out = toCitations([hit("a", 0.8), hit("b", 0.5), hit("c", 0.1)], 0.25);
    expect(out.map((c) => c.tag)).toEqual(["S1", "S2"]);
    expect(out[1].title).toBe("Title b");
  });

  it("labels each passage with its tag, title, and page for the model", () => {
    const text = formatSources(toCitations([hit("a", 0.9), hit("b", 0.9)], 0));
    expect(text).toContain('<source id="S2" title="Title b, p. 3">');
    expect(text).toContain("Content a");
  });

  it("tells the model when nothing matched", () => {
    expect(formatSources([])).toContain("No research passages matched");
  });

  it("parses single and grouped citation tags", () => {
    expect(citedTags("Giving feels good [S2]. Also [S1, S3] and again [S2].")).toEqual(["S2", "S1", "S3"]);
    expect(citedTags("No citations here [1].")).toEqual([]);
  });

  it("computes cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});
