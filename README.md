# MeaningEngine

A conversational reflection tool from the Institute on Generosity (IoG). A person talks about their giving: why they give, what they care about, and what they're unsure about. MeaningEngine responds with questions and insights drawn only from the research and Giving Guides IoG has shared, citing its sources. At the end, it writes a personal giving reflection they can download, copy, or print.

It is explicitly **not** a therapist or a financial advisor. It's a structured reflection companion.

## How it works

1. **Research corpus.** IoG's documents go in `corpus/iog/`. This is the tool's only source: it doesn't draw on outside research or the model's general knowledge of studies and statistics. `npm run ingest` splits each document into passages of about 500 words, turns each into a search vector (OpenAI embeddings), and stores them in Supabase (pgvector).
2. **Each turn.** The app finds the 6 passages closest to what the person just said and gives them to Claude with the conversation. Claude replies with a question or reflection and cites any research it uses as [S1], [S2], …. The chat shows each cited source under the reply.
3. **Safety first.** Before any model call, each message is checked against the crisis phrases in `config/safety.yaml`. On a match, the app shows crisis resources (988, Crisis Text Line, NAMI, findahelpline.com) and doesn't call the model. The conversation prompt also tells Claude to share these resources if it notices distress the phrase list misses.
4. **Reflection.** After a few exchanges, a "Create my reflection" button appears. Claude writes a structured reflection: a summary, values, practices to try, and questions to keep. Citations on practices come from the retrieved passages, never from the model: if Claude names a source id it wasn't given, the code drops it.

Conversations are not stored. Everything lives in the browser tab until it's closed.

## Running it locally

Needs Node 20+.

```bash
npm install
cp .env.example .env.local      # then fill in ANTHROPIC_API_KEY and OPENAI_API_KEY
set -a; source .env.local; set +a
npm run ingest -- --dry         # check what will be indexed (no API calls)
npm run ingest                  # build the research index
npm run dev                     # http://localhost:3000
```

Without Supabase settings, ingest writes `data/index.json` and the app searches that file, which is fine for development.

## Research corpus

- **Add or update a document:** put the file (`.pdf`, `.docx`, `.md`, or `.txt`) in `corpus/iog/`, then run `npm run ingest`. Each run rebuilds the whole index, so removed files drop out too.
- **Titles and links:** optional, in `corpus/sources.yaml`. Without an entry, the title comes from the PDF's metadata or its filename. Add a `url` so people can open the source from a citation.
- **IoG materials only:** IoG wants the tool to draw only on what it has shared, so don't add outside papers. The prompts also tell the model not to bring in studies, statistics, or frameworks from its general knowledge.
- **Loaded so far:** the 13 IoG Giving Guides (GG2026). The originals are named "Copy of …"; they were copied in with clean filenames, and their citation titles are set in `corpus/sources.yaml`.
- **Scanned PDFs** have no extractable text; ingest warns and skips them. Run OCR first.
- **`corpus/iog/` is gitignored** because this GitHub repo is public. Keep the master copies in IoG's shared drive and run ingest from a machine that has them. If the repo is made private, remove that line from `.gitignore` to version the PDFs here.

## Changing the conversation

Most changes need no code:

| To change… | Edit |
| --- | --- |
| How MeaningEngine talks, the session arc, scope limits | `prompts/conversation.md` |
| What goes into the end-of-session reflection | `prompts/reflection.md` (fields are in `lib/reflection.ts`) |
| Opening message, session length, when the reflection button appears | `config/engine.yaml` |
| Model, effort, number of research passages per turn | `config/engine.yaml` |
| Crisis phrases and the crisis message | `config/safety.yaml` |
| Colors and fonts (IoG branding) | the tokens at the top of `app/globals.css` |

## Changing the LLM

Models are set in `config/engine.yaml` under `llm:`. Provider code lives in [`lib/llm.ts`](lib/llm.ts). To use another provider, add a class implementing `ChatProvider` and register it in `PROVIDERS`. Embeddings work the same way in [`lib/embeddings.ts`](lib/embeddings.ts). Changing the embeddings model means re-running ingest, and for Supabase, matching the `vector(1536)` column size.

## Cost

The default is Claude Opus 5.5 at low effort for the conversation. Claude Opus 5.5 costs $4 per million input tokens and $20 per million output tokens. A 10-exchange session plus a reflection comes to roughly $0.30–0.50 (about 7k input tokens per turn, mostly the prompt and the research passages). That's well above the proposal's $0.01–0.05 per-session target. To hit it, set `chat_model: claude-haiku-5-5` (about 40× cheaper per token, roughly $0.01 per session) or `claude-sonnet-5-5` (about half the price of Opus), then compare conversation quality on a few test sessions. The server log prints token counts for every turn. Embeddings cost a fraction of a cent per session, and well under $1 to index the whole corpus.

## Deploying (Vercel + Supabase)

1. Create a Supabase project. In the SQL editor, run [`supabase/migrations/0001_corpus.sql`](supabase/migrations/0001_corpus.sql).
2. Locally, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and run `npm run ingest`. The index now lives in Supabase.
3. Import the repo into Vercel. Add `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` under **Settings → Environment Variables**.

The service role key stays on the server. The `corpus_chunks` table has row-level security on, so the public anon key can't read it.

## Tests

```bash
npm test          # chunking, crisis detection, citation handling
npm run typecheck
```

## Status

- [x] RAG over IoG's research and Giving Guides, with cited sources
- [x] Conversation design (prompt), crisis interception, scope limits
- [x] End-of-session giving reflection with download / copy / print
- [x] Local dev index; Supabase pgvector for production
- [ ] **Licensed professional review of `config/safety.yaml` and the safety section of `prompts/conversation.md` (required before public launch)**
- [x] 13 IoG Giving Guides (GG2026) loaded
- [ ] Conversation design workshop with IoG staff; tune `prompts/conversation.md`
- [ ] Rate limiting for the public endpoint
- [ ] Optional accounts and saved sessions (Supabase); email the reflection
- [ ] Kiosk mode for convenings; post-session survey
- [ ] IoG branding (logo, colors, fonts)
