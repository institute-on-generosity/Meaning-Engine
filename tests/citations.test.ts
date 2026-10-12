import { describe, expect, it } from "vitest";
import { CitationTracker, citedTags } from "@/lib/citations";

describe("CitationTracker", () => {
  it("numbers new passages and reuses the tag for a repeat", () => {
    const t = new CitationTracker();
    expect(t.cite("Guide A", "  Giving starts\nwith an impulse. ")).toEqual({ tag: "S1", title: "Guide A", quote: "Giving starts with an impulse." });
    expect(t.marker()).toBe(" [S1]");
    expect(t.cite("Guide B", "Risk is part of giving.")?.tag).toBe("S2");
    expect(t.cite("Guide A", "Giving starts with an impulse.")).toBeNull(); // same passage, same tag
    expect(t.marker()).toBe(" [S2, S1]");
  });

  it("returns no marker when nothing was cited since the last block", () => {
    const t = new CitationTracker();
    expect(t.marker()).toBe("");
    t.cite("Guide A", "x");
    t.marker();
    expect(t.marker()).toBe("");
  });

  it("produces markers the UI can parse back", () => {
    const t = new CitationTracker();
    t.cite("A", "one");
    t.cite("B", "two");
    expect(citedTags(`Some text${t.marker()} and more.`)).toEqual(["S1", "S2"]);
  });
});

describe("citedTags", () => {
  it("parses single and grouped tags in order", () => {
    expect(citedTags("Giving feels good [S2]. Also [S1, S3] and again [S2].")).toEqual(["S2", "S1", "S3"]);
    expect(citedTags("No citations here [1].")).toEqual([]);
  });
});
