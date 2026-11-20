# GuideGPT: staff training session

A hands-on session, about 75 minutes, for the IoG staff who will look after GuideGPT. By the end, each person has done every routine task once, on their own laptop, with the fellow watching rather than driving. The [staff guide](staff-guide.md) is the reference for each step.

## Before the session

- [ ] Each person has a GitHub account with write access to `institute-on-generosity/Meaning-Engine`.
- [ ] Each person has access to IoG's Vercel team and the Anthropic Console.
- [ ] Each laptop has Node.js 20 or later, and a copy of the repository with `npm install` run.
- [ ] Each person has the Giving Guides in `corpus/iog/` (from IoG's shared drive) and an `.env.local` with an Anthropic API key.
- [ ] The usage dashboard Sheet is set up (staff guide, "The usage dashboard"), so there's something to look at.

## 1. Try it as a visitor (10 min)

On the live site, each person picks a different advisor and has a short conversation, then creates the reflection or plan and answers the survey.

- Find one passage the advisor quoted, and check it against the guide.
- Type a crisis phrase from `config/safety.yaml` and see the crisis message.
- Ask for something off-topic ("write me a cover letter") and see it decline.

## 2. Run it on your laptop (10 min)

```bash
set -a; source .env.local; set +a
npm test
npm run dev
```

Open http://localhost:3000. Same app, with your local changes.

## 3. Change an advisor (15 min)

In `config/advisors.yaml`, change one advisor's `opening_message`. Restart `npm run dev` and check the new message appears. Then:

- link straight to that advisor with `/?advisor=<id>`;
- read its `focus`, and talk through what each stage is for and what its limits protect against;
- check its guides' total size in `config/corpus.json` (`tokens`) and why it should stay under about 85,000.

Undo the change with `git checkout config/advisors.yaml`.

## 4. Test a change before it goes live (15 min)

```bash
npm run compare -- --models claude-haiku-5-5             # the plan and estimated cost
npm run compare -- --yes --models claude-haiku-5-5       # under $0.10
```

Open `evals/out/<date>/report.md`. For each conversation, read the "What to look for" line, then the replies. Agree as a group on what "good" looks like, especially for the Safety and Guardrail conversations.

## 5. Update a guide (10 min)

Walk through "Update the Giving Guides" in the staff guide with a dry run only:

```bash
npm run corpus -- --dry
```

Talk through what would happen next (upload, adding it to an advisor, `npm test`, commit and push, prune) without uploading anything.

## 6. Ship a change and read the numbers (10 min)

- Make a small, real change together (for example, a clearer advisor tagline), commit it, and push. Watch Vercel redeploy it.
- Open the usage dashboard and find: completed sessions so far, the "insightful or useful" share, and average minutes per session.
- Find the latest deployment in Vercel, and where its logs are.

## 7. When something goes wrong (5 min)

Go through "If something goes wrong" in the staff guide, and agree who to contact for the Anthropic account (spend limit, keys) and for Vercel.

## Sign-off

Each person can, without help:

- [ ] change an advisor's text and see it locally;
- [ ] run the tests and the model comparison, and read the report;
- [ ] add a guide to an advisor, or create a new advisor, keeping it under the size limit;
- [ ] push a change and confirm it's live;
- [ ] read the usage dashboard;
- [ ] know that changes to `config/safety.yaml` or the safety parts of `prompts/conversation.md` need the licensed reviewer's approval first.

| Name | Date | Signed off by |
| --- | --- | --- |
| | | |
