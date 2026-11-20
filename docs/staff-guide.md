# GuideGPT: guide for IoG staff

GuideGPT is IoG's AI reflection tool. A visitor talks with it about their giving, and it responds with questions and ideas drawn only from IoG's Giving Guides, quoting the passage it used. At the end, it writes them a personal giving reflection.

This guide covers everyday upkeep. Most tasks are editing a text file and redeploying; none need programming. The technical details are in the [README](../README.md).

## What you need

- **The code:** a copy of this GitHub repository on a computer with Node.js 20 or later. Run `npm install` once.
- **An Anthropic API key** from IoG's account at console.anthropic.com, saved in a file named `.env.local` in the project folder as `ANTHROPIC_API_KEY=sk-ant-api03-…`. Never commit this file or paste the key anywhere public.
- **The Giving Guides** in `corpus/iog/`. This folder isn't in GitHub because the repository is public, so keep the master copies in IoG's shared drive.
- **Access to the hosting account** (for example Vercel) to redeploy and set settings.

Before running any `npm run` command, load the key:

```bash
set -a; source .env.local; set +a
```

## Update the Giving Guides

1. Put the new or revised file (`.pdf`, `.docx`, `.md`, or `.txt`) in `corpus/iog/`. To remove a guide, delete its file.
2. Give it a clean title in `corpus/sources.yaml`. The title is what visitors see when GuideGPT cites it.
3. Run `npm run corpus -- --dry` to check what will change, then `npm run corpus` to upload.
4. **New guide:** add it to an advisor's `guides:` list in `config/advisors.yaml` (see the next section), or GuideGPT won't use it. **Removed guide:** delete it from every advisor's list.
5. Run `npm test`. It fails, naming the file, if an advisor lists a guide that isn't uploaded or a guide belongs to no advisor.
6. Commit and push `config/corpus.json` and `config/advisors.yaml`. Vercel redeploys the site automatically from GitHub within a few minutes.
7. Once the new version is live, run `npm run corpus -- --prune` to delete the old uploaded copies.

GuideGPT draws only on IoG's own materials. Don't add outside research.

## Add or change an advisor

GuideGPT's advisors live in [`config/advisors.yaml`](../config/advisors.yaml). Each one has:

| Field | What it is |
| --- | --- |
| `id` | Short name used in links, e.g. `evaluation` makes `/?advisor=evaluation`. Lowercase letters, digits and hyphens. |
| `name`, `tagline`, `description` | What visitors see on the advisor's card. |
| `opening_message` | The advisor's first message in the chat. |
| `reflection_label`, `button_label` | What the end-of-session document is called ("evaluation plan") and its button ("Create my evaluation plan"). |
| `guides` | The Giving Guides it reads, as paths from `config/corpus.json` (e.g. `iog/ecosystem-mapping.docx`). |
| `focus` | Instructions for this advisor only: who it is, the loose stages of its conversation, and what it must never do. |

**To add an advisor,** copy an existing block, give it a new `id`, and change the fields. The first advisor in the file is the default.

**Keep each advisor's guides under about 85,000 tokens in all.** Each guide's size is in `config/corpus.json` under `tokens`. On Claude Haiku, a request over 100,000 tokens costs about five times as much per token, so an advisor that reads too much quietly becomes five times as expensive. If an advisor needs more guides, split it into two advisors.

**Write `focus` like a brief to a new colleague.** Say what the advisor helps with, list four or five stages in the order a good conversation usually goes, and spell out its limits: for example, never rate a specific organization, or never recommend amounts. The shared rules in `prompts/conversation.md` (tone, citing the guides, safety) apply to every advisor automatically.

**After any change,**
1. run `npm test`;
2. add or adjust a test conversation for the advisor in `scripts/compare-models.ts` (each has an `advisor:` line);
3. run `npm run compare -- --yes --models claude-haiku-5-5` (under $0.10), read the report, and check the "Guardrail" and "Safety" conversations still behave;
4. commit and push.

## Change how it talks

| To change… | Edit this file |
| --- | --- |
| Tone, citing the guides, what every advisor won't do, safety | `prompts/conversation.md` |
| One advisor's name, opening message, guides, conversation stages and limits | `config/advisors.yaml` |
| What goes in the end-of-session reflection | `prompts/reflection.md` |
| Session length, and after how many messages the "Create my…" button appears | `config/engine.yaml` |
| Words that trigger the crisis message, and the message itself | `config/safety.yaml` |
| Colors and fonts | the top of `app/globals.css` |

Commit and push; the site updates on the next deploy. Write prompt changes in plain language, as if briefing a thoughtful new colleague.

**Safety changes need review.** Changes to `config/safety.yaml`, or to the "Safety" and "What you are not" sections of `prompts/conversation.md`, should be reviewed by the licensed mental-health professional who approved the launch version. Run `npm run safety-packet` to produce an up-to-date `docs/safety-review.md` for them.

**Privacy page.** If you change what GuideGPT collects (for example, adding email), update `/about` (`app/about/page.tsx`) to match.

## Choose the model (and the cost)

The model is set in `config/engine.yaml` (`chat_model` and `reflection_model`). Rough cost of one session:

| Model | Per session | Notes |
| --- | --- | --- |
| `claude-haiku-5-5` | ~$0.02–0.04 | **Current choice.** Fastest and cheapest |
| `claude-sonnet-5-5` | ~$0.30–0.40 | |
| `claude-opus-5-5` | ~$0.60–0.70 | Most capable; cites the guides slightly more consistently |

These figures assume each advisor stays under about 85,000 tokens of guides (see "Add or change an advisor"). At 500 sessions a month on Haiku, that's roughly $10–20.

To compare them on the same test conversations:

```bash
npm run compare            # shows what it will run and the estimated cost (about $4.50 for all three models, under $0.10 for Haiku alone)
npm run compare -- --yes   # runs it and writes evals/out/<date>/report.md
```

The report shows each model's replies, citations, reflections, and cost side by side, with notes on what to look for. Read a few and pick the cheapest model whose conversations you're happy with.

## Protect the budget

1. **Set a monthly spend limit** in the Anthropic Console (**Settings → Limits**) for the workspace GuideGPT uses. This is the real cap: past the limit, the site stops answering rather than running up a bill.
2. **Built-in limits:** each visitor's network is capped at 120 messages per 10 minutes and 30 reflections per hour (`limits:` in `config/engine.yaml`). A whole convening on one Wi-Fi network shares one network address, so keep these generous.
3. **Only the GuideGPT site can use the API**; requests from other websites are refused.
4. **Each reply is capped** at 2,500 output tokens and each reflection at 4,000 (`max_reply_tokens` and `max_reflection_tokens` in `config/engine.yaml`). Normal replies use 120–250, so this only stops runaway output. If a reply is ever cut off, the visitor sees a note offering to continue.
5. **It stays on its job.** The conversation instructions tell it to decline unrelated tasks, refuse to reveal its instructions, and not hand out whole guides. After changing `prompts/conversation.md`, re-run `npm run compare -- --yes --models claude-haiku-5-5` and check the three "Guardrail:" conversations in the report.

## See how it's doing

GuideGPT records three anonymous events, never including conversation text. Each one notes which advisor was used and whether it came from the website or the kiosk:

- **`session_started`:** someone sent their first message.
- **`reflection_created`:** someone completed a session by creating their reflection or plan. This counts toward the 200-session goal, and records how many messages and minutes the session took.
- **`survey`:** their answer to "How would you describe this conversation?" (insightful, useful, neutral, or not useful), plus an optional comment.

### The usage dashboard

[`docs/usage-dashboard.gs`](usage-dashboard.gs) collects the events in a Google Sheet and builds a **Dashboard** tab that updates itself as events arrive:

- sessions started and completed, against the goal of 200 completed sessions;
- the completion rate;
- the share of survey answers that are "insightful" or "useful", against the goal of over 75%;
- average minutes per completed session, against the goal of more than five;
- sessions started and completed for each advisor;
- a chart of sessions per day, and the 25 most recent survey comments.

To set it up (about 10 minutes, once):

1. Create a Google Sheet, then open **Extensions → Apps Script**.
2. Replace the code with the contents of `docs/usage-dashboard.gs` and save.
3. In the function menu, choose **setupDashboard** and click **Run**. Approve the permissions it asks for. This creates the Events and Dashboard tabs.
4. Click **Deploy → New deployment**, choose type **Web app**, set "Execute as" to **Me** and "Who has access" to **Anyone**, then deploy and copy the web app URL.
5. In Vercel (project → **Settings → Environment Variables**), add `FEEDBACK_WEBHOOK_URL` set to that URL, and redeploy.

Keep the web app URL private: anyone who has it can add rows to the Sheet. Run **setupDashboard** again any time to rebuild the Dashboard tab; it never touches the Events data. Until the webhook is set up, events only appear in Vercel's logs.

## Run it at a convening (kiosk mode)

Open the site's `/kiosk` page (for example `https://<your-site>/kiosk`) on the shared laptop or tablet. Each visitor picks an advisor on the welcome screen. In kiosk mode:

- The screen clears itself after 3 minutes without activity, after a 30-second "Still there?" warning. Change these under `kiosk:` in `config/engine.yaml`.
- The "Start over" button becomes **End session** and returns to the welcome screen and its choice of advisors.
- At the end, visitors can **Print** their reflection or **Finish and clear the screen**. Download and copy are hidden, so nothing is left on the shared device.
- Survey answers are tagged `kiosk` so convening feedback can be told apart from the website's.

Use the browser's full-screen or kiosk mode, and test the printer beforehand if you plan to offer printing.

## If something goes wrong

| Symptom | Likely cause |
| --- | --- |
| "Something went wrong on our end" on every message | The API key is missing or wrong in the hosting settings, the spend limit was reached, or the guides were uploaded from a different Anthropic account. Check the hosting logs. |
| `npm run corpus` says "key rejected" or 401 | The key in `.env.local` is wrong. Create a new one in the Console and copy it with the Copy button. |
| Citations stopped appearing after a guide update | `config/corpus.json` wasn't committed, or `--prune` ran before the new version was live. Run `npm run corpus` again and push. |
| Visitors see "Lots of activity from your network" | Many people on one network. Raise the numbers under `limits:` in `config/engine.yaml`. |
| A guide was skipped as having "no extractable text" | It's a scanned PDF. Run it through OCR (for example, Adobe Acrobat's "Recognize Text") and try again. |
