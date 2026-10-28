# MeaningEngine: guide for IoG staff

MeaningEngine is IoG's AI reflection tool. A visitor talks with it about their giving, and it responds with questions and ideas drawn only from IoG's Giving Guides, quoting the passage it used. At the end, it writes them a personal giving reflection.

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
2. Give it a clean title in `corpus/sources.yaml`. The title is what visitors see when MeaningEngine cites it.
3. Run `npm run corpus -- --dry` to check what will change, then `npm run corpus` to upload.
4. Commit and push the updated `config/corpus.json`. The host redeploys automatically.
5. Once the new version is live, run `npm run corpus -- --prune` to delete the old uploaded copies.

MeaningEngine draws only on IoG's own materials. Don't add outside research.

## Change how it talks

| To change… | Edit this file |
| --- | --- |
| Tone, the flow of the conversation, what it won't do | `prompts/conversation.md` |
| What goes in the end-of-session reflection | `prompts/reflection.md` |
| The opening message, session length, when "Create my reflection" appears | `config/engine.yaml` |
| Words that trigger the crisis message, and the message itself | `config/safety.yaml` |
| Colors and fonts | the top of `app/globals.css` |

Commit and push; the site updates on the next deploy. Write prompt changes in plain language, as if briefing a thoughtful new colleague.

**Safety changes need review.** Changes to `config/safety.yaml`, or to the "Safety" and "What you are not" sections of `prompts/conversation.md`, should be reviewed by the licensed mental-health professional who approved the launch version.

## Choose the model (and the cost)

The model is set in `config/engine.yaml` (`chat_model` and `reflection_model`). Rough cost of one session:

| Model | Per session | Notes |
| --- | --- | --- |
| `claude-opus-5-5` | ~$0.70–1.00 | Most capable |
| `claude-sonnet-5-5` | ~$0.55–0.70 | |
| `claude-haiku-5-5` | ~$0.15 | Fastest and cheapest |

To compare them on the same test conversations:

```bash
npm run compare            # shows what it will run and the estimated cost (about $4–5)
npm run compare -- --yes   # runs it and writes evals/out/<date>/report.md
```

The report shows each model's replies, citations, reflections, and cost side by side, with notes on what to look for. Read a few and pick the cheapest model whose conversations you're happy with.

## Protect the budget

1. **Set a monthly spend limit** in the Anthropic Console (**Settings → Limits**) for the workspace MeaningEngine uses. This is the real cap: past the limit, the site stops answering rather than running up a bill.
2. **Built-in limits:** each visitor's network is capped at 120 messages per 10 minutes and 30 reflections per hour (`limits:` in `config/engine.yaml`). A whole convening on one Wi-Fi network shares one network address, so keep these generous.
3. **Only the MeaningEngine site can use the API**; requests from other websites are refused.

## See how it's doing

MeaningEngine records three anonymous events, never including conversation text:

- **`session_started`:** someone sent their first message.
- **`reflection_created`:** someone completed a session. This counts toward the 200-session goal.
- **`survey`:** their answer to "How would you describe this conversation?" (insightful, useful, neutral, or not useful), plus an optional comment.

The "insightful or useful" rate is (insightful + useful) ÷ all survey answers; the goal is over 75%.

By default, events only appear in the hosting service's logs. To collect them in a Google Sheet:

1. Create a Google Sheet, then open **Extensions → Apps Script**.
2. Replace the code with the snippet below and save.
3. Click **Deploy → New deployment**, choose type **Web app**, set "Execute as" to **Me** and "Who has access" to **Anyone**, then deploy and copy the web app URL.
4. In the hosting settings, add the environment variable `FEEDBACK_WEBHOOK_URL` set to that URL, and redeploy.

```javascript
function doPost(e) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName("Events") || book.insertSheet("Events");
  if (sheet.getLastRow() === 0) sheet.appendRow(["at", "type", "mode", "turns", "rating", "comment", "model"]);
  const d = JSON.parse(e.postData.contents);
  sheet.appendRow([d.at, d.type, d.mode, d.turns ?? "", d.rating ?? "", d.comment ?? "", d.model ?? ""]);
  return ContentService.createTextOutput("ok");
}
```

Keep the web app URL private: anyone who has it can add rows to the Sheet.

## Run it at a convening (kiosk mode)

Open the site's `/kiosk` page (for example `https://<your-site>/kiosk`) on the shared laptop or tablet. In kiosk mode:

- The screen clears itself after 3 minutes without activity, after a 30-second "Still there?" warning. Change these under `kiosk:` in `config/engine.yaml`.
- The "Start over" button becomes **End session** and returns to the welcome screen.
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
