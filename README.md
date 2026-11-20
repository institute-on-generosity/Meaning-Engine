# GuideGPT

AI advisors from the Institute on Generosity (IoG) that help people think through their giving. A person picks an advisor and talks with it; GuideGPT responds with questions and insights drawn only from IoG's Giving Guides, quoting its sources. At the end, it writes a short reflection or plan the person can download, copy, or print.

| Advisor | For | Giving Guides it reads |
| --- | --- | --- |
| **Giving Reflection** | Why you give and what makes it meaningful | Meaningful Generosity, Clarifying Your Giving Criteria and Priorities, Philanthropic Giving Models, Philanthropic Asset Portfolio |
| **Nonprofit Evaluation Coach** | How to judge whether a nonprofit is effective | Initial Assessment, In-Depth Due Diligence, Evaluating Effectiveness, Site Visit, Funder–Nonprofit Partnership |
| **Giving Strategy Planner** | Shaping a giving plan | Clarifying Your Giving Criteria and Priorities, Ecosystem Mapping, Philanthropic Giving Models, Philanthropic Asset Portfolio, Philanthropic Risk |
| **Leadership & Advocacy Guide** | Board service and policy advocacy | Nonprofit Board Service, Policy Advocacy |

Advisors are defined in [`config/advisors.yaml`](config/advisors.yaml): name, opening message, which guides it reads, and its focus. Link straight to one with `/?advisor=<id>` (for example `/?advisor=evaluation`).

It is explicitly **not** a therapist or a financial advisor. Its advisors help people think things through; they don't decide for them.

**IoG staff:** day-to-day upkeep (updating guides, changing the model, survey results, convenings) is in the [staff guide](docs/staff-guide.md), and the [staff training plan](docs/staff-training.md) walks new maintainers through it hands-on. What's left before launch is in the [launch checklist](docs/launch-checklist.md).

## How it works

1. **IoG's corpus.** IoG's documents (currently the 13 GG2026 Giving Guides) go in `corpus/iog/`. `npm run corpus` extracts each one's text and uploads it to Anthropic's file storage, then records the file ids in `config/corpus.json`. These documents are the tool's only source: the prompts forbid outside studies, statistics, and frameworks.
2. **Each turn.** Claude gets the chosen advisor's guides in full plus the conversation. The guides come first and are identical for every session with that advisor, so prompt caching makes repeated reads about a twentieth of the normal input price. Claude replies with a question or reflection. When it draws on a guide, Anthropic's citations feature returns the exact sentence it relied on, and the chat shows that quote under the reply.
3. **Safety first.** Before any model call, each message is checked against the crisis phrases in `config/safety.yaml`. On a match, the app shows crisis resources (988, Crisis Text Line, NAMI, findahelpline.com) and doesn't call the model. The conversation prompt also tells Claude to share these resources if it notices distress the phrase list misses.
4. **Reflection.** After a few exchanges, a "Create my reflection" button appears. Claude writes a structured reflection: a summary, values, practices to try, and questions to keep. Each practice can name the guides it draws on; the code keeps only titles that match a real document.

Conversations are not stored. Everything lives in the browser tab until it's closed.

Also included:

- **Post-session survey.** After the reflection, one question ("insightful / useful / neutral / not useful") plus an optional comment.
- **Anonymous usage events** (session started, reflection created, survey answer), printed to the server log. If `FEEDBACK_WEBHOOK_URL` is set, they're also posted there, for example to a Google Sheet. Conversation text is never included.
- **Kiosk mode** at `/kiosk` for convenings. It clears itself after inactivity, and visitors can print but not download.
- **Abuse limits.** The API only accepts requests from the site itself, with per-network rate limits set in `config/engine.yaml`. Each reply is capped at 2,500 output tokens and each reflection at 4,000 (`max_reply_tokens`, `max_reflection_tokens`), which bounds the cost of any single call.
- **Scope rules in the prompt.** GuideGPT declines off-topic tasks (cover letters, homework, code) and steers back to giving. It won't reveal its instructions or switch roles. It won't reproduce, list, or summarize whole guides or sections. The `off-topic`, `override`, and `extract` conversations in `npm run compare` check these.
- **About & privacy page** at `/about`: what the tool draws on, what it isn't, and what happens to what visitors type.
- **Embedding.** Pages on `instituteongenerosity.org` may show GuideGPT in an iframe; other sites can't. Change this with `EMBED_ALLOWED_ORIGINS`.
- **Safety review packet.** `npm run safety-packet` writes `docs/safety-review.md` from the live safety rules, for the licensed professional who reviews them.

## Running it locally

Needs Node 20+ and an Anthropic API key. That's the only key.

```bash
npm install
cp .env.example .env.local      # then fill in ANTHROPIC_API_KEY
set -a; source .env.local; set +a
npm run corpus -- --dry         # check what will be uploaded (no API calls)
npm run corpus                  # upload the documents, write config/corpus.json
npm run dev                     # http://localhost:3000
npm run compare                 # plan a side-by-side model comparison (add --yes to run it)
npm run safety-packet           # regenerate docs/safety-review.md
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

Each advisor's guides are sent in full on every turn. That works because they're small: 72–86k tokens per advisor as sent (with citations on; per-guide counts are in `config/corpus.json`), and Claude reads up to 1M. Keep each advisor under about 85k tokens: on Claude Haiku, a request over 100k tokens costs about five times as much per token. If an advisor needs more, split it into two advisors. `npm run corpus` warns when the whole corpus passes about 400k tokens. Well past that point, it would make sense to switch to search, giving Claude only the passages relevant to each turn. That version (OpenAI embeddings + Supabase pgvector) is in this repo's git history, in the first commit.

## Changing the conversation

Most changes need no code:

| To change… | Edit |
| --- | --- |
| How every advisor talks, scope limits, safety | `prompts/conversation.md` |
| An advisor's name, opening message, guides, focus and session arc; adding an advisor | `config/advisors.yaml` |
| What goes into the end-of-session reflection | `prompts/reflection.md` (fields are in `lib/reflection.ts`) |
| Session length, when the reflection button appears | `config/engine.yaml` |
| Model and effort | `config/engine.yaml` |
| Crisis phrases and the crisis message | `config/safety.yaml` |
| Colors and fonts (IoG branding) | the tokens at the top of `app/globals.css` |

## Changing the LLM

Models are set in `config/engine.yaml` under `llm:`. Provider code lives in [`lib/llm.ts`](lib/llm.ts). To use another provider, add a class implementing `ChatProvider` and register it in `PROVIDERS`. That class also has to give its model the corpus, for example via that provider's own file upload, since the uploaded files belong to Anthropic's storage.

## Cost

Each turn sends the advisor's guides (72–86k tokens) plus the conversation. Prompt caching charges a one-time write when the cache is cold (1.25× the input price), then about a tenth of the input price for each turn that reuses it within 5 minutes. The reflection doesn't resend the guides, only the passages the conversation cited. Rough cost of a 10-turn session plus a reflection, with the cache cold:

| Model (`chat_model`) | Per session |
| --- | --- |
| `claude-haiku-5-5` (default) | ~$0.02–0.04 |
| `claude-sonnet-5-5` | ~$0.30–0.40 |
| `claude-opus-5-5` | ~$0.60–0.70 |

Measured on Haiku (November 2026): 12 four-message test conversations across the four advisors cost $0.08 in all, $0.002–0.016 each. At 500 sessions a month that's roughly $10–20, inside the proposal's $0.01–0.05 per session. Before advisors, when every turn sent all 13 guides (254k tokens, over Haiku's 100k price tier), a session cost about $0.30.

The server log prints input, cache-read, cache-write, and output tokens for every turn.

## Deploying

1. Import the repo into Vercel, or IoG's usual host. Vercel's free plan is for non-commercial personal use, so use its paid plan for an IoG site.
2. Add `ANTHROPIC_API_KEY` under **Settings → Environment Variables**. Use a key from the account that uploaded the corpus. Optionally, add `FEEDBACK_WEBHOOK_URL` to collect survey answers.
3. Set a monthly spend limit on that Anthropic workspace. The in-app rate limits only slow down a single network; the spend limit is what caps the bill.
4. Deploy. `config/corpus.json` in the repo tells the site which uploaded documents to read.

## Tests

```bash
npm test          # crisis detection, citation numbering, text cleanup, rate limits
npm run typecheck
```

GitHub runs the typecheck, tests, and a production build on every push (`.github/workflows/checks.yml`).

## Status

- [x] IoG's 13 Giving Guides as the grounding corpus, with quoted citations
- [x] Four advisors (reflection, nonprofit evaluation, giving strategy, leadership & advocacy), each reading only its guides
- [x] Conversation design (prompt), crisis interception, scope limits
- [x] End-of-session giving reflection with download / copy / print
- [x] IoG branding (2026 brand guide palette and type, Prompt Library layout)
- [x] Rate limiting and same-origin check
- [x] Post-session survey and anonymous usage events
- [x] Kiosk mode for convenings
- [x] Model comparison script and staff guide
- [x] About & privacy page, security headers, accessibility pass (WCAG AA contrast, screen-reader labels)
- [x] Safety review packet, launch checklist, automatic checks on GitHub
- [ ] **Licensed professional review of `config/safety.yaml` and the safety section of `prompts/conversation.md` (required before public launch)**
- [x] Upload the corpus with IoG's Anthropic key; run `npm run compare -- --yes`; pick the model (Haiku)
- [ ] Conversation design workshop with IoG staff; tune `prompts/conversation.md`
- [ ] Optional accounts and saved sessions; email the reflection
