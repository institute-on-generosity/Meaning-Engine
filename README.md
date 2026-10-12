# MeaningEngine

A conversational reflection tool from the Institute on Generosity (IoG). A person talks about their giving: why they give, what they care about, and what they're unsure about. MeaningEngine responds with questions and insights drawn only from the materials IoG has shared, quoting its sources. At the end, it writes a personal giving reflection the person can download, copy, or print.

It is explicitly **not** a therapist or a financial advisor. It's a structured reflection companion.

## How it works

1. **IoG's corpus.** IoG's documents (currently the 13 GG2026 Giving Guides) go in `corpus/iog/`. `npm run corpus` extracts each one's text and uploads it to Anthropic's file storage, then records the file ids in `config/corpus.json`. These documents are the tool's only source: the prompts forbid outside studies, statistics, and frameworks.
2. **Each turn.** Claude gets the whole corpus plus the conversation. The documents come first and are identical for every session, so prompt caching makes repeated reads about a tenth of the normal input price. Claude replies with a question or reflection. When it draws on a guide, Anthropic's citations feature returns the exact sentence it relied on, and the chat shows that quote under the reply.
3. **Safety first.** Before any model call, each message is checked against the crisis phrases in `config/safety.yaml`. On a match, the app shows crisis resources (988, Crisis Text Line, NAMI, findahelpline.com) and doesn't call the model. The conversation prompt also tells Claude to share these resources if it notices distress the phrase list misses.
4. **Reflection.** After a few exchanges, a "Create my reflection" button appears. Claude writes a structured reflection: a summary, values, practices to try, and questions to keep. Each practice can name the guides it draws on; the code keeps only titles that match a real document.

Conversations are not stored. Everything lives in the browser tab until it's closed.

## Running it locally

Needs Node 20+ and an Anthropic API key. That's the only key.

```bash
npm install
cp .env.example .env.local      # then fill in ANTHROPIC_API_KEY
set -a; source .env.local; set +a
npm run corpus -- --dry         # check what will be uploaded (no API calls)
npm run corpus                  # upload the documents, write config/corpus.json
npm run dev                     # http://localhost:3000
```

## IoG's corpus

- **Add or update a document:** put the file (`.pdf`, `.docx`, `.md`, or `.txt`) in `corpus/iog/`, then run `npm run corpus`. Only new or changed documents are uploaded.
- **Publish the change:** commit `config/corpus.json` and deploy. Once the new version is live, run `npm run corpus -- --prune` to delete the old uploaded copies. Pruning earlier would break the live site until it redeploys.
- **Titles:** set in `corpus/sources.yaml`; these are what citations show. Without an entry, the title comes from the filename.
- **IoG materials only:** IoG wants the tool to draw only on what it has shared, so don't add outside papers.
- **Loaded so far:** the 13 IoG Giving Guides (GG2026). The originals are named "Copy of …"; they were copied in with clean filenames.
- **`corpus/iog/` is gitignored** because this GitHub repo is public. Keep the master copies in IoG's shared drive. The uploaded text lives in IoG's Anthropic account, visible only to that account's API keys. The ids in `config/corpus.json` are useless without such a key.
- **Same account everywhere:** the API key the site runs with must belong to the same Anthropic account and workspace that ran `npm run corpus`.
- **Scanned PDFs** have no extractable text; `npm run corpus` warns and skips them. Run OCR first.

## Size limits

The whole corpus is sent on every turn. That works because it's small: the 13 guides are about 130k tokens, and Claude reads up to 1M. Cost and first-reply time grow with the corpus, and `npm run corpus` warns above about 400k tokens. Well past that point, it would make sense to switch to search, giving Claude only the passages relevant to each turn. That version (OpenAI embeddings + Supabase pgvector) is in this repo's git history, in the first commit.

## Changing the conversation

Most changes need no code:

| To change… | Edit |
| --- | --- |
| How MeaningEngine talks, the session arc, scope limits | `prompts/conversation.md` |
| What goes into the end-of-session reflection | `prompts/reflection.md` (fields are in `lib/reflection.ts`) |
| Opening message, session length, when the reflection button appears | `config/engine.yaml` |
| Model and effort | `config/engine.yaml` |
| Crisis phrases and the crisis message | `config/safety.yaml` |
| Colors and fonts (IoG branding) | the tokens at the top of `app/globals.css` |

## Changing the LLM

Models are set in `config/engine.yaml` under `llm:`. Provider code lives in [`lib/llm.ts`](lib/llm.ts). To use another provider, add a class implementing `ChatProvider` and register it in `PROVIDERS`. That class also has to give its model the corpus, for example via that provider's own file upload, since the uploaded files belong to Anthropic's storage.

## Cost

The corpus is about 130k tokens per request. Prompt caching charges a one-time write when the cache is cold (about 1.25× the input price), then about a tenth of the input price for each turn that reuses it within 5 minutes. Rough cost of a 10-turn session plus a reflection:

| Model (`chat_model`) | Per session |
| --- | --- |
| `claude-opus-5-5` (default) | ~$0.70–1.00 |
| `claude-sonnet-5-5` | ~$0.55–0.70 |
| `claude-haiku-5-5` | ~$0.15 |

The proposal targets $0.01–0.05 per session. The biggest levers:

- **A smaller model.** Compare conversation quality on a few test sessions.
- **A smaller corpus.** *Policy Advocacy* alone is about a fifth of the corpus, and IoG marks only parts of it and of *Philanthropic Asset Portfolio* as core reading.

The server log prints input, cache-read, cache-write, and output tokens for every turn.

## Deploying

1. Import the repo into Vercel, or IoG's usual host. Vercel's free plan is for non-commercial personal use, so use its paid plan for an IoG site.
2. Add `ANTHROPIC_API_KEY` under **Settings → Environment Variables**. Use a key from the account that uploaded the corpus.
3. Deploy. `config/corpus.json` in the repo tells the site which uploaded documents to read.

## Tests

```bash
npm test          # crisis detection, citation numbering, text cleanup
npm run typecheck
```

## Status

- [x] IoG's 13 Giving Guides as the full grounding corpus, with quoted citations
- [x] Conversation design (prompt), crisis interception, scope limits
- [x] End-of-session giving reflection with download / copy / print
- [x] IoG branding (2026 brand guide palette and type, Prompt Library layout)
- [ ] **Licensed professional review of `config/safety.yaml` and the safety section of `prompts/conversation.md` (required before public launch)**
- [ ] Upload the corpus with IoG's Anthropic key; test conversations; pick the model
- [ ] Conversation design workshop with IoG staff; tune `prompts/conversation.md`
- [ ] Rate limiting for the public endpoint
- [ ] Optional accounts and saved sessions; email the reflection
- [ ] Kiosk mode for convenings; post-session survey
