import { describe, expect, it } from "vitest";
import { CitationTracker, OpeningFilter, PhraseRewriter, TagFilter, citedTags, dropFillerOpening, dropLeadingHeadings, rewritePhrases, stripTags } from "@/lib/citations";

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

describe("dropFillerOpening", () => {
  it("drops a short opening sentence that only grades the message", () => {
    expect(dropFillerOpening("That's a useful thing to name. Knowing what you want comes first.")).toBe("Knowing what you want comes first.");
    expect(dropFillerOpening("That's a fair thing to want. A yearly fight wears on both of you.")).toBe("A yearly fight wears on both of you.");
    expect(dropFillerOpening("Thanks for saying that plainly. Routine giving can drift.")).toBe("Routine giving can drift.");
    expect(dropFillerOpening("That's an honest thing to notice. Relief isn't the same as meaning.")).toBe("Relief isn't the same as meaning.");
  });

  it("keeps openings that carry content", () => {
    const keep = [
      "That sounds exhausting: the news keeps producing urgent needs. What would help?",
      "That's a significant decision, and the gap may be on your mind. What comes up?",
      "Your dad's work as a rural doctor shaped what your family cared about. What stands out?",
      "That's a useful thing to name.",
    ];
    for (const k of keep) expect(dropFillerOpening(k)).toBe(k);
  });
});

describe("OpeningFilter", () => {
  const run = (chunks: string[]) => {
    const f = new OpeningFilter();
    return chunks.map((c) => f.push(c)).join("") + f.flush();
  };

  it("drops filler split across chunks and passes the rest through", () => {
    expect(run(["That's a ", "useful thing", " to name. Knowing", " what you want comes first."])).toBe(
      "Knowing what you want comes first.",
    );
  });

  it("leaves a reply that opens with substance untouched", () => {
    const parts = ["Five programs ", "in one city is a manageable set. ", "Which would you visit first?"];
    expect(run(parts)).toBe(parts.join(""));
  });

  it("releases a short reply that never finishes a sentence", () => {
    expect(run(["I'm sorry"])).toBe("I'm sorry");
  });
});

describe("rewritePhrases", () => {
  const url = "https://www.instituteongenerosity.org/learning-resources/";
  it("rewrites claims that the guide can be read at the resources page", () => {
    expect(rewritePhrases(`You can read the full guide at ${url}.`)).toBe(`IoG shares its learning resources at ${url}.`);
    expect(rewritePhrases(`you can find the complete guide online at ${url}`)).toBe(`IoG shares its learning resources at ${url}.`);
    expect(rewritePhrases("I can't paste it, but I can point you to where to read it.")).toBe(
      "I can't paste it, but I can point you to IoG's learning resources.",
    );
    expect(rewritePhrases("I'm glad to point you toward where to read it.")).toBe("I'm glad to point you to IoG's learning resources.");
    expect(rewritePhrases("I can show you where to find the guide.")).toBe("I can show you IoG's learning resources.");
    expect(rewritePhrases("I'm glad to point you to where it lives and help with the rest.")).toBe(
      "I'm glad to point you to IoG's learning resources and help with the rest.",
    );
  });

  it("turns any sentence carrying the resources link into the accurate one", () => {
    expect(rewritePhrases(`It's IoG's to share. The learning resources page at ${url} is the place to read it in full.\n\nWhat I can do is help.`)).toBe(
      `It's IoG's to share. IoG shares its learning resources at ${url}.\n\nWhat I can do is help.`,
    );
    expect(rewritePhrases(`Happy to help. For the full text, IoG shares its learning resources at ${url}. What's on your mind?`)).toBe(
      `Happy to help. IoG shares its learning resources at ${url}. What's on your mind?`,
    );
  });

  it("leaves accurate sentences alone", () => {
    const ok = `IoG shares its learning resources at ${url}. You can read more about your own values here.`;
    expect(rewritePhrases(ok)).toBe(ok);
  });
});

describe("PhraseRewriter", () => {
  const url = "https://www.instituteongenerosity.org/learning-resources/";
  const run = (chunks: string[]) => {
    const r = new PhraseRewriter();
    return chunks.map((c) => r.push(c)).join("") + r.flush();
  };

  it("catches a phrase split across chunks inside a long reply", () => {
    const before = "I won't go through the guide section by section, since that would reproduce it. ".repeat(3);
    const out = run([before, "You can read the ", "full guide at ", url.slice(0, 30), url.slice(30), ". What's the policy question on your mind?"]);
    expect(out).toBe(`${before}IoG shares its learning resources at ${url}. What's the policy question on your mind?`);
  });

  it("streams the accurate sentence through intact, even one character at a time", () => {
    const reply = `I won't go through it section by section. IoG shares its learning resources at ${url}.\n\nWhat's on your mind?`;
    expect(run([...reply])).toBe(reply);
    expect(run([reply.slice(0, 50), reply.slice(50, 97), reply.slice(97)])).toBe(reply);
  });

  it("keeps the space between a sentence and a rewritten one", () => {
    const reply = `I can point you to IoG's learning resources. You can find it at ${url}. What's on your mind?`;
    expect(run([...reply])).toBe(`I can point you to IoG's learning resources. IoG shares its learning resources at ${url}. What's on your mind?`);
  });

  it("passes ordinary text through unchanged", () => {
    const parts = ["Five programs in one city ", "is a manageable set to compare. ", "Which would you visit first?"];
    expect(run(parts)).toBe(parts.join(""));
  });
});
