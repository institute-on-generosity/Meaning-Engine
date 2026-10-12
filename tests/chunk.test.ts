import { describe, expect, it } from "vitest";
import { chunkDocument } from "@/lib/rag/chunk";

describe("chunkDocument", () => {
  it("keeps short documents in one passage", () => {
    const out = chunkDocument([{ page: 1, text: "One.\n\nTwo." }], 100, 10);
    expect(out).toEqual([{ page: 1, content: "One. Two." }]);
  });

  it("splits long text under the size limit, with overlap, tracking the start page", () => {
    const para = (n: number) => `Paragraph ${n} ` + "word ".repeat(30);
    const pages = [
      { page: 1, text: [para(1), para(2)].join("\n\n") },
      { page: 2, text: [para(3), para(4)].join("\n\n") },
    ];
    const out = chunkDocument(pages, 400, 60);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.content.length).toBeLessThanOrEqual(400 + 60);
    expect(out[0].page).toBe(1);
    expect(out[out.length - 1].page).toBe(2);
    // Overlap: the start of each later passage repeats the end of the one before it.
    expect(out[1].content.startsWith(out[0].content.slice(-20).trim().split(" ").slice(1).join(" "))).toBe(true);
  });

  it("never repeats a paragraph except in the overlap", () => {
    const paras = Array.from({ length: 30 }, (_, i) => `Unique paragraph ${i} ` + "filler ".repeat(20));
    const out = chunkDocument([{ page: null, text: paras.join("\n\n") }], 500, 0);
    const joined = out.map((c) => c.content).join(" ");
    for (let i = 0; i < 30; i++) {
      expect(joined.match(new RegExp(`Unique paragraph ${i} `, "g"))?.length).toBe(1);
    }
    const withOverlap = chunkDocument([{ page: null, text: paras.join("\n\n") }], 500, 100);
    for (const c of withOverlap) {
      for (let i = 0; i < 30; i++) {
        expect((c.content.match(new RegExp(`Unique paragraph ${i} `, "g")) ?? []).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("breaks a single huge paragraph at sentences", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const out = chunkDocument([{ page: null, text }], 200, 0);
    expect(out.length).toBeGreaterThan(3);
    for (const c of out) expect(c.content.length).toBeLessThanOrEqual(200);
    expect(out.every((c) => c.content.endsWith("."))).toBe(true);
  });

  it("ignores empty pages", () => {
    expect(chunkDocument([{ page: 1, text: "  \n\n " }], 100, 10)).toEqual([]);
  });
});
