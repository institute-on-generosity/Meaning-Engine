/**
 * Build the research index from corpus/.
 *
 *   npm run ingest            # chunk, embed, and write to Supabase (or data/index.json locally)
 *   npm run ingest -- --dry   # chunk only; print what would be indexed, no API calls
 *
 * Documents: IoG's own research in corpus/iog/ (.pdf, .docx, .md, .txt). MeaningEngine draws only
 * on what IoG has shared; don't add outside sources here.
 * corpus/sources.yaml gives optional titles and links per file.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import mammoth from "mammoth";
import { extractText, getDocumentProxy, getMeta } from "unpdf";
import { engineConfig } from "../lib/config";
import { getEmbedder } from "../lib/embeddings";
import { chunkDocument, type PageText } from "../lib/rag/chunk";
import { getStore, type EmbeddedChunk } from "../lib/rag/store";

const CORPUS = path.join(process.cwd(), "corpus");
const FOLDERS = ["iog"];
const PUBLISHER = "Institute on Generosity";
const EXTENSIONS = new Set([".pdf", ".docx", ".md", ".txt"]);

const Manifest = z.object({
  sources: z
    .array(
      z.object({
        file: z.string(),
        title: z.string().optional(),
        publisher: z.string().optional(),
        url: z.string().url().optional(),
      }),
    )
    .default([]),
});

async function readDocument(file: string): Promise<{ pages: PageText[]; metaTitle?: string }> {
  if (file.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
    const { text } = await extractText(pdf, { mergePages: false });
    const meta = await getMeta(pdf).catch(() => undefined);
    const metaTitle = (meta?.info as { Title?: string } | undefined)?.Title?.trim();
    return { pages: text.map((t, i) => ({ page: i + 1, text: t })), metaTitle: metaTitle || undefined };
  }
  if (file.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ path: file });
    return { pages: [{ page: null, text: value }] };
  }
  return { pages: [{ page: null, text: fs.readFileSync(file, "utf8") }] };
}

function titleFromFilename(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  const dry = process.argv.includes("--dry");
  const { chunk_chars, chunk_overlap_chars } = engineConfig().retrieval;
  const manifestPath = path.join(CORPUS, "sources.yaml");
  const manifest = Manifest.parse(fs.existsSync(manifestPath) ? parse(fs.readFileSync(manifestPath, "utf8")) : {});
  const details = new Map(manifest.sources.map((s) => [s.file, s]));

  const files: string[] = [];
  for (const folder of FOLDERS) {
    const dir = path.join(CORPUS, folder);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir, { recursive: true }) as string[]) {
      const full = path.join(dir, name);
      if (name === "README.md" || !fs.statSync(full).isFile()) continue;
      if (!EXTENSIONS.has(path.extname(name).toLowerCase())) {
        console.warn(`skip ${folder}/${name}: only .pdf, .docx, .md, and .txt are supported`);
        continue;
      }
      files.push(path.relative(CORPUS, full).split(path.sep).join("/"));
    }
  }
  for (const entry of manifest.sources) {
    if (!files.includes(entry.file)) console.warn(`sources.yaml lists ${entry.file}, but that file isn't in corpus/`);
  }
  if (files.length === 0) throw new Error("No documents found in corpus/iog.");

  const chunks: Omit<EmbeddedChunk, "embedding">[] = [];
  for (const sourceId of files.sort()) {
    const entry = details.get(sourceId);
    const { pages, metaTitle } = await readDocument(path.join(CORPUS, sourceId));
    const title = entry?.title ?? metaTitle ?? titleFromFilename(sourceId);
    const parts = chunkDocument(pages, chunk_chars, chunk_overlap_chars);
    if (parts.length === 0) {
      console.warn(`skip ${sourceId}: no extractable text (scanned PDF? run OCR first)`);
      continue;
    }
    parts.forEach((p, n) =>
      chunks.push({
        id: `${sourceId}#${n}`,
        sourceId,
        title,
        publisher: entry?.publisher ?? PUBLISHER,
        url: entry?.url ?? null,
        page: p.page,
        content: p.content,
      }),
    );
    console.log(`${sourceId}: "${title}", ${parts.length} passages`);
  }
  console.log(`\n${files.length} documents → ${chunks.length} passages`);
  if (dry) return;

  // Prefix each passage with its title when embedding so search knows what document it's from.
  const embeddings = await getEmbedder().embed(chunks.map((c) => `${c.title}\n\n${c.content}`));
  const store = getStore();
  await store.replaceAll(chunks.map((c, i) => ({ ...c, embedding: embeddings[i] })));
  console.log(`Indexed into ${store.name}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
