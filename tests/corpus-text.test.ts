import { describe, expect, it } from "vitest";
import { htmlToText, normalizeText, tableToText } from "@/lib/corpus-text";

describe("normalizeText", () => {
  it("unifies line endings, trims trailing spaces, and collapses blank runs", () => {
    expect(normalizeText("Title  \r\n\r\n\r\n\r\nBody \nline\r\n\n\n")).toBe("Title\n\nBody\nline");
  });
});

describe("tableToText", () => {
  it("turns each row into one labeled sentence", () => {
    const html =
      "<table><thead><tr><th><p><strong>Element</strong></p></th><th><p>Core Question</p></th></tr>" +
      "<tr><th><p>Values</p></th><th><p>What matters to me and why?</p></th></tr>" +
      "<tr><td><p>Evidence</p></td><td><p>Rigor &amp; judgment</p></td></tr></thead></table>";
    expect(tableToText(html)).toBe(
      "Element: Values; Core Question: What matters to me and why?\n\nElement: Evidence; Core Question: Rigor & judgment.",
    );
  });

  it("joins cells when there's no usable header row", () => {
    expect(tableToText("<table><tr><td>Only</td><td>row</td></tr></table>")).toBe("Only; row.");
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs, headings, and list items as separate blocks", () => {
    const html = "<h1>OVERVIEW</h1><p>First <strong>point</strong>.</p><ul><li>One</li><li>Two</li></ul>";
    expect(htmlToText(html)).toBe("OVERVIEW\n\nFirst point.\n\n- One\n\n- Two");
  });
});
