# MeaningEngine launch checklist

Everything between today and a public launch, in order. Items marked **IoG** need a decision or sign-off from IoG; the rest are setup.

## 1. Get it running

- [ ] Create an Anthropic API key in IoG's Console account (starts with `sk-ant-api03-`) and add credits.
- [ ] Set a monthly spend limit on that workspace (**Settings → Limits**).
- [ ] Upload the Giving Guides: `npm run corpus`, then commit and push `config/corpus.json`.

## 2. Choose the model and tune the conversation

- [ ] Run `npm run compare -- --yes` (about $4–5) and read `evals/out/<date>/report.md`.
- [ ] **IoG:** pick the model from that report, weighing conversation quality against cost per session. Set it in `config/engine.yaml`.
- [ ] **IoG:** decide whether to include all of *Policy Advocacy* and *Philanthropic Asset Portfolio*, or only the core pages. Including all of them raises the cost of every session.
- [ ] **IoG:** conversation design session with staff. Try the test site, then adjust `prompts/conversation.md` and the opening message.

## 3. Safety review (required before launch)

- [ ] **IoG:** engage a licensed mental-health professional.
- [ ] Run `npm run safety-packet` and send them `docs/safety-review.md`, plus the test-site link and the two "Safety:" conversations from the comparison report.
- [ ] Make the changes they require, regenerate the packet, and record their sign-off in it.

## 4. Privacy and content review

The About & privacy page (`app/about/page.tsx`, at `/about`) describes what happens to what visitors type. **IoG** confirms:

- [ ] Anthropic's commercial terms and privacy policy (linked from the page) are acceptable for this use, including how long Anthropic retains API data.
- [ ] The hosting provider's request logs and retention are acceptable, and match "standard technical logs … for a limited time".
- [ ] The survey wording ("IoG keeps your rating and any comment you type, without your name") matches how the results will be stored.
- [ ] The contact link should point to IoG's website, or to a specific address or page instead.
- [ ] Any IoG-wide privacy policy that should be linked or that this page must match.

## 5. Hosting

- [ ] **IoG:** choose hosting (Vercel Pro, or IoG's usual host) and a web address, such as `meaning.instituteongenerosity.org`.
- [ ] Set `ANTHROPIC_API_KEY` in the host's environment settings.
- [ ] Optional: survey results to a Google Sheet (`FEEDBACK_WEBHOOK_URL`); see the staff guide.
- [ ] Optional: to embed MeaningEngine on pages outside `instituteongenerosity.org`, set `EMBED_ALLOWED_ORIGINS`. By default, only IoG's own domains may embed it.
- [ ] Deploy, then run the smoke test below on the live site.

## 6. Smoke test on the live site

- [ ] A full session: messages, a citation with its quoted passage, "Create my reflection", the survey.
- [ ] A crisis phrase shows the crisis message.
- [ ] `/about` loads, and lists the Giving Guides.
- [ ] `/kiosk` clears itself after inactivity. Test the printer, if offering printing at an event.
- [ ] On a phone: the layout works, and the message box stays usable with the keyboard open.
- [ ] With a screen reader (VoiceOver on Mac or iPhone): you can start a session, hear replies with who said them, and answer the survey.
- [ ] Survey and usage events arrive where expected (the Sheet or the host's logs).

## 7. Hand-off

- [ ] **IoG:** staff know where the staff guide is (`docs/staff-guide.md`) and have practiced updating a guide and redeploying.
- [ ] **IoG:** decide on later features: emailing the reflection (needs an email service) and optional accounts with saved sessions (needs a database).
