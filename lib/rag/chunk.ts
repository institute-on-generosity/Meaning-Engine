export interface PageText {
  page: number | null;
  text: string;
}

export interface TextChunk {
  page: number | null;
  content: string;
}

/**
 * Split a document into overlapping passages of roughly `size` characters, breaking at paragraph
 * and then sentence boundaries. Each passage records the page it starts on.
 */
export function chunkDocument(pages: PageText[], size: number, overlap: number): TextChunk[] {
  const pieces: { page: number | null; text: string }[] = [];
  for (const { page, text } of pages) {
    for (const para of text.split(/\n\s*\n/)) {
      const clean = para.replace(/\s+/g, " ").trim();
      if (!clean) continue;
      if (clean.length <= size) {
        pieces.push({ page, text: clean });
      } else {
        for (const sentence of splitLong(clean, size)) pieces.push({ page, text: sentence });
      }
    }
  }

  const chunks: TextChunk[] = [];
  let current: { page: number | null; text: string } | null = null;
  for (const piece of pieces) {
    if (current && current.text.length + 1 + piece.text.length > size) {
      chunks.push({ page: current.page, content: current.text });
      const tail = overlapTail(current.text, overlap);
      current = { page: piece.page, text: tail ? `${tail} ${piece.text}` : piece.text };
    } else {
      current = current ? { page: current.page, text: `${current.text} ${piece.text}` } : { ...piece };
    }
  }
  if (current) chunks.push({ page: current.page, content: current.text });
  return chunks;
}

function splitLong(text: string, size: number): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g) ?? [text];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && buf.length + s.length > size) {
      out.push(buf.trim());
      buf = "";
    }
    if (s.length > size) {
      for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size).trim());
    } else {
      buf += s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** The last ~`overlap` characters of a passage, starting at a word boundary. */
function overlapTail(text: string, overlap: number): string {
  if (overlap <= 0) return "";
  if (text.length <= overlap) return text;
  const tail = text.slice(-overlap);
  const space = tail.indexOf(" ");
  return space === -1 ? tail : tail.slice(space + 1);
}
