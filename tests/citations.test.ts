import { describe, expect, it } from "vitest";
import { CitationTracker, TagFilter, citedTags, dropLeadingHeadings, stripTags } from "@/lib/citations";

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

describe("dropLeadingHeadings", () => {
  it("drops the guide title and all-caps headings before the prose", () => {
    const t = new CitationTracker();
    const quote = "Giving Guide: Site Visits\n\nOVERVIEW\n\nSite visits can deepen\nour understanding.";
    expect(t.cite("Giving Guide: Site Visits", quote)?.quote).toBe("Site visits can deepen our understanding.");
  });

  it("drops a title that carries a footnote marker", () => {
    const quote = "Giving Guide: Policy Advocacy[1]\n\nOVERVIEW\n\nPhilanthropy can engage in policy advocacy.";
    expect(dropLeadingHeadings(quote, "Giving Guide: Policy Advocacy")).toBe("Philanthropy can engage in policy advocacy.");
  });

  it("keeps acronyms inside the prose and a quote that is only a heading", () => {
    expect(dropLeadingHeadings("NGO boards meet quarterly.", "Guide")).toBe("NGO boards meet quarterly.");
    expect(dropLeadingHeadings("OVERVIEW", "Guide")).toBe("OVERVIEW");
  });
});

describe("citedTags", () => {
  it("parses single and grouped tags in order", () => {
    expect(citedTags("Giving feels good [S2]. Also [S1, S3] and again [S2].")).toEqual(["S2", "S1", "S3"]);
    expect(citedTags("No citations here [1].")).toEqual([]);
  });
});

describe("stripTags", () => {
  it("removes single and grouped tags with their leading space", () => {
    expect(stripTags("Values clarify direction [S1]. Evidence informs [S2, S3].")).toBe("Values clarify direction. Evidence informs.");
    expect(stripTags("Nothing to remove [1] here.")).toBe("Nothing to remove [1] here.");
  });
});

describe("TagFilter", () => {
  const run = (chunks: string[]) => {
    const f = new TagFilter();
    return chunks.map((c) => f.push(c)).join("") + f.flush();
  };

  it("drops tags the model types, even when split across chunks", () => {
    expect(run(["IoG suggests this [", "S1", "]. Next"])).toBe("IoG suggests this. Next");
    expect(run(["Both apply [S1,", " S2] here."])).toBe("Both apply here.");
    expect(run(["text [S", "12]"])).toBe("text");
  });

  it("passes ordinary brackets and text through unchanged", () => {
    expect(run(["A note [see below] and [", "1] too."])).toBe("A note [see below] and [1] too.");
    expect(run(["Plain ", "text."])).toBe("Plain text.");
    expect(run(["ends with [S"])).toBe("ends with [S");
  });
});
