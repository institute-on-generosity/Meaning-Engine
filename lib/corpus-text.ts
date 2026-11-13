import fs from "node:fs";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const CORPUS_EXTENSIONS = [".pdf", ".docx", ".md", ".txt"];

/** Tidy extracted text: unify line endings, drop trailing spaces, at most one blank line in a row. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text inside an HTML fragment, with tags removed and whitespace collapsed. */
function inner(html: string): string {
  // Block boundaries (paragraphs inside a table cell, line breaks) become spaces; inline
  // formatting like <strong> just disappears, so "<strong>point</strong>." stays "point."
  const spaced = html.replace(/<\/?(p|br|div|li|h[1-6])\b[^>]*>/gi, " ").replace(/<[^>]+>/g, "");
  return decode(spaced).replace(/\s+/g, " ").trim();
}

/**
 * A table as sentences, one per row, labeled with the header row:
 * "Element: Values; Core Question: What matters to me and why?; What It Contributes: Direction…."
 * Without this, cells run together into one unpunctuated block that the citation feature quotes whole.
 */
export function tableToText(tableHtml: string): string {
  const rows = [...tableHtml.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)].map((r) =>
    [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => inner(c[1])),
  );
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  const sentence = (cells: string[]) => {
    const text = cells.filter(Boolean).join("; ");
    return text && !/[.!?]$/.test(text) ? `${text}.` : text;
  };
  const labeled = body.length > 0 && header.every(Boolean);
  if (!labeled) return rows.map(sentence).filter(Boolean).join("\n\n");
  return body
    .map((cells) => sentence(cells.map((c, i) => (c ? `${header[i] ?? ""}: ${c}`.replace(/^: /, "") : ""))))
    .filter(Boolean)
    .join("\n\n");
}

/** Readable plain text from the HTML mammoth produces: paragraphs, headings, list items, tables. */
export function htmlToText(html: string): string {
  const withTables = html.replace(/<table[\s\S]*?<\/table>/gi, (t) => `<p>${tableToText(t).replace(/\n\n/g, "</p><p>")}</p>`);
  const blocks = [...withTables.matchAll(/<(p|h[1-6]|li)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) =>
    m[1].toLowerCase() === "li" ? `- ${inner(m[2])}` : inner(m[2]),
  );
  return normalizeText(blocks.filter((b) => b && b !== "-").join("\n\n"));
}

/** Plain text of a corpus document. */
export async function documentText(file: string): Promise<string> {
  const lower = file.toLowerCase();
  if (lower.endsWith(".docx")) {
    return htmlToText((await mammoth.convertToHtml({ path: file })).value);
  }
  if (lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
    const { text } = await extractText(pdf, { mergePages: false });
    return normalizeText(text.join("\n\n"));
  }
  return normalizeText(fs.readFileSync(file, "utf8"));
}
