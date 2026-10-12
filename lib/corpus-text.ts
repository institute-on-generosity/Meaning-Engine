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

/** Plain text of a corpus document. */
export async function documentText(file: string): Promise<string> {
  const lower = file.toLowerCase();
  if (lower.endsWith(".docx")) {
    return normalizeText((await mammoth.extractRawText({ path: file })).value);
  }
  if (lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
    const { text } = await extractText(pdf, { mergePages: false });
    return normalizeText(text.join("\n\n"));
  }
  return normalizeText(fs.readFileSync(file, "utf8"));
}
