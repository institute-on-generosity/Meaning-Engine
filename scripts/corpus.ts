/**
 * Upload IoG's documents so MeaningEngine can read them.
 *
 *   npm run corpus              # upload new or changed documents, update config/corpus.json
 *   npm run corpus -- --dry     # show what would be uploaded (no API calls)
 *   npm run corpus -- --prune   # delete uploaded copies no longer in config/corpus.json
 *
 * Documents live in corpus/iog/ (.pdf, .docx, .md, .txt) and stay out of git. Each one's text is
 * uploaded to Anthropic's file storage; config/corpus.json records the file ids and is committed,
 * so the deployed app knows what to read. Commit and deploy that file, then run --prune.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { CorpusDoc } from "../lib/config";
import { CORPUS_EXTENSIONS, documentText } from "../lib/corpus-text";
import { corpusStorage } from "../lib/llm";

const DIR = path.join(process.cwd(), "corpus", "iog");
const SOURCES = path.join(process.cwd(), "corpus", "sources.yaml");
const MANIFEST = path.join(process.cwd(), "config", "corpus.json");
const PREFIX = "meaningengine__"; // marks our uploads in the account's file storage

const Sources = z.object({
  sources: z.array(z.object({ file: z.string(), title: z.string().optional() })).default([]),
});

function titleFromFilename(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function readManifest(): CorpusDoc[] {
  return fs.existsSync(MANIFEST) ? (JSON.parse(fs.readFileSync(MANIFEST, "utf8")).documents as CorpusDoc[]) : [];
}

async function prune() {
  const keep = new Set(readManifest().map((d) => d.file_id));
  const storage = corpusStorage();
  let removed = 0;
  for await (const f of storage.listFiles()) {
    if (f.filename.startsWith(PREFIX) && !keep.has(f.id)) {
      await storage.deleteFile(f.id);
      console.log(`deleted ${f.filename} (${f.id})`);
      removed++;
    }
  }
  console.log(removed ? `Removed ${removed} old upload(s).` : "Nothing to prune.");
}

async function main() {
  if (process.argv.includes("--prune")) return prune();
  const dry = process.argv.includes("--dry");

  const titles = new Map(
    Sources.parse(fs.existsSync(SOURCES) ? parse(fs.readFileSync(SOURCES, "utf8")) : {}).sources.map((s) => [s.file, s.title]),
  );
  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => CORPUS_EXTENSIONS.includes(path.extname(f).toLowerCase()) && f !== "README.md").sort()
    : [];
  if (files.length === 0) throw new Error("No documents in corpus/iog/.");

  const previous = new Map(readManifest().map((d) => [d.source, d]));
  const storage = dry ? null : corpusStorage();
  const documents: CorpusDoc[] = [];
  let totalChars = 0;

  for (const name of files) {
    const source = `iog/${name}`;
    const title = titles.get(source) ?? titleFromFilename(name);
    const text = await documentText(path.join(DIR, name));
    if (!text) {
      console.warn(`skip ${source}: no extractable text (scanned PDF? run OCR first)`);
      continue;
    }
    totalChars += text.length;
    // The title is part of the hash so a renamed document is re-uploaded with its new name.
    const sha256 = crypto.createHash("sha256").update(`${title}\n${text}`).digest("hex");
    const prior = previous.get(source);
    let fileId = prior?.sha256 === sha256 ? prior.file_id : null;
    const status = fileId ? "unchanged" : prior ? "changed" : "new";
    if (!fileId && storage) {
      fileId = await storage.upload(`${PREFIX}${path.basename(name, path.extname(name))}.txt`, text);
    }
    console.log(`${status.padEnd(9)} ${title} (${Math.round(text.length / 1000)}k chars)`);
    documents.push({ title, source, file_id: fileId ?? "(dry run)", sha256, chars: text.length });
  }

  const estTokens = Math.round(totalChars / 4);
  console.log(`\n${documents.length} documents, ~${Math.round(estTokens / 1000)}k tokens sent with every request.`);
  if (estTokens > 400_000) {
    console.warn("That's large: cost and first-reply latency grow with it. Consider bringing back search (see README).");
  }
  if (dry) return;

  fs.writeFileSync(MANIFEST, JSON.stringify({ documents }, null, 2) + "\n");
  console.log("Wrote config/corpus.json. Commit it and deploy, then run `npm run corpus -- --prune`.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
