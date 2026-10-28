/**
 * Run the same scripted conversations on several Claude models and write a side-by-side report,
 * so IoG can choose a model by comparing quality against cost.
 *
 *   npm run compare                      # show the plan and estimated cost, then stop
 *   npm run compare -- --yes             # run it (spends real money; about $4–5 for all models and conversations)
 *   npm run compare -- --yes --models claude-haiku-5-5,claude-sonnet-5-5 --personas habit,family
 *
 * Needs ANTHROPIC_API_KEY and an uploaded corpus (`npm run corpus`). Writes evals/out/<time>/report.md.
 * The visitor's side of each conversation is fixed in advance, so every model gets the same inputs.
 */
import fs from "node:fs";
import path from "node:path";
import { corpus, engineConfig, prompt } from "../lib/config";
import { getProvider, type Turn, type Usage } from "../lib/llm";
import { createReflection, type Reflection } from "../lib/reflection";

interface Persona {
  id: string;
  label: string;
  /** What the test checks for, shown in the report so reviewers know what to look at. */
  watch: string;
  turns: string[];
}

const PERSONAS: Persona[] = [
  {
    id: "habit",
    label: "Giving out of habit",
    watch: "Does it help them find the original meaning without lecturing?",
    turns: [
      "I give to my old high school every year but honestly it feels like a habit at this point.",
      "I think I started because a couple of teachers really believed in me when I was a kid. I was the first in my family to go to college.",
      "I guess I want other kids to get that same push. But I never hear what the money does, so it feels kind of abstract.",
      "Maybe I should make it more personal somehow. I'm not sure what that would look like.",
    ],
  },
  {
    id: "family",
    label: "Spouses who disagree",
    watch: "Does it stay neutral between them and draw out values, not pick a side?",
    turns: [
      "My wife and I keep arguing about where our giving should go.",
      "She wants to give locally, to our food bank and our kids' school. I think the money goes further overseas.",
      "We both care about the same things really, people having enough. We just can't agree on how.",
      "I don't want this to be a fight every December.",
    ],
  },
  {
    id: "daf",
    label: "DAF holder, unsure",
    watch: "Does it avoid financial or tax advice and recommending charities, while still being helpful?",
    turns: [
      "I put a big chunk of stock into a donor-advised fund three years ago and most of it is still sitting there.",
      "Should I just grant it all out this year? Or invest it and give more later? What would you do?",
      "I think I'm stuck because I don't really know what I'm trying to accomplish.",
      "My dad was a doctor in a rural town. Health stuff always mattered to our family.",
    ],
  },
  {
    id: "guilt",
    label: "Guilt and overwhelm",
    watch: "Does it avoid pressure to give more, and handle heavy feelings with care without playing therapist?",
    turns: [
      "Every time I open the news I feel like I should be giving more. Everything feels urgent and I feel guilty all the time.",
      "We give maybe 2% of our income. Friends of ours give 10% and I feel like a bad person.",
      "I donated to a disaster fund last month and felt nothing. Just relief that I'd done something.",
      "What would it even look like for giving to feel good instead of like paying off guilt?",
    ],
  },
  {
    id: "diligence",
    label: "Practical due-diligence question",
    watch: "Does it use the Giving Guides well (with citations) without turning into a lecture?",
    turns: [
      "How do I know if a nonprofit is actually effective? I want to give more seriously but I don't know how to judge.",
      "I mostly care about youth mentoring programs in my city. There are like five of them.",
      "Is it okay to just ask them for their results? I feel awkward about it.",
      "I think I want to visit a couple of them before deciding.",
    ],
  },
];

// Estimated USD per million tokens. Haiku's prices are its long-prompt tier, since the corpus alone
// is over 100k tokens. Cache writes are 1.25x input; cache reads are the published read price.
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
};

function cost(model: string, u: Omit<Usage, "model">): number {
  const p = PRICES[model];
  if (!p) return NaN;
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Run {
  model: string;
  persona: Persona;
  transcript: { role: "user" | "assistant"; content: string; citations: string[] }[];
  reflection: Reflection | null;
  error: string | null;
  cost: number;
  seconds: number;
}

async function runOne(model: string, persona: Persona): Promise<Run> {
  const config = engineConfig();
  const documents = corpus();
  const system = `${prompt("conversation")}\n\nThe session opened with this message from you:\n"${config.opening_message}"`;
  const history: Turn[] = [];
  const transcript: Run["transcript"] = [];
  let total = 0;
  const started = Date.now();
  try {
    for (const line of persona.turns) {
      history.push({ role: "user", content: line });
      transcript.push({ role: "user", content: line, citations: [] });
      let text = "";
      const citations: string[] = [];
      for await (const event of getProvider().streamReply({ model, effort: config.llm.chat_effort, system, history, documents })) {
        if (event.type === "text") text += event.text;
        else if (event.type === "citation") citations.push(`${event.citation.tag} ${event.citation.title}: "${event.citation.quote}"`);
        else if (event.type === "usage") total += cost(model, event.usage);
        else if (event.type === "declined") text += "\n\n[model declined]";
      }
      history.push({ role: "assistant", content: text });
      transcript.push({ role: "assistant", content: text, citations });
      process.stdout.write(".");
    }
    const reflection = await createReflection(history, { model, onUsage: (u) => (total += cost(model, u)) });
    return { model, persona, transcript, reflection, error: null, cost: total, seconds: (Date.now() - started) / 1000 };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { model, persona, transcript, reflection: null, error, cost: total, seconds: (Date.now() - started) / 1000 };
  }
}

function report(runs: Run[], models: string[], personas: Persona[]): string {
  const out: string[] = ["# MeaningEngine model comparison", "", `Run ${new Date().toISOString()}.`, ""];
  out.push(
    "Costs are estimates from token counts and list prices. Runs for one model happen back to back, so after its first conversation the corpus is read from cache. Real sessions spread across a day pay the cache-write cost more often.",
    "",
  );
  out.push("| Model | Avg cost / session | Avg time / session | Errors |", "| --- | --- | --- | --- |");
  for (const m of models) {
    const rs = runs.filter((r) => r.model === m);
    const avg = (f: (r: Run) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    out.push(`| ${m} | $${avg((r) => r.cost).toFixed(3)} | ${avg((r) => r.seconds).toFixed(0)}s | ${rs.filter((r) => r.error).length} |`);
  }
  for (const p of personas) {
    out.push("", "---", "", `## ${p.label}`, "", `**What to look for:** ${p.watch}`);
    for (const m of models) {
      const r = runs.find((x) => x.model === m && x.persona.id === p.id)!;
      out.push("", `### ${m} ($${r.cost.toFixed(3)}, ${r.seconds.toFixed(0)}s)`, "");
      for (const t of r.transcript) {
        out.push(`**${t.role === "user" ? "Visitor" : "MeaningEngine"}:** ${t.content.replace(/\n+/g, " ")}`, "");
        for (const c of t.citations) out.push(`> ${c}`, "");
      }
      if (r.error) out.push(`**Error:** ${r.error}`, "");
      if (r.reflection) {
        const ref = r.reflection;
        out.push(`**Reflection: ${ref.title}**`, "", ref.summary, "");
        out.push(...ref.values.map((v) => `- Value: **${v.value}** (${v.evidence})`));
        out.push(...ref.practices.map((x) => `- Practice: **${x.practice}** ${x.why}${x.guides.length ? ` [${x.guides.join("; ")}]` : ""}`));
        out.push(...ref.questions_to_keep.map((q) => `- Question: ${q}`), "");
      }
    }
  }
  return out.join("\n");
}

async function main() {
  const models = (arg("--models") ?? Object.keys(PRICES).join(",")).split(",");
  const wanted = arg("--personas")?.split(",");
  const personas = wanted ? PERSONAS.filter((p) => wanted.includes(p.id)) : PERSONAS;
  for (const m of models) if (!PRICES[m]) throw new Error(`No price listed for ${m}; add it to PRICES in this script.`);
  if (personas.length === 0) throw new Error(`No personas matched. Options: ${PERSONAS.map((p) => p.id).join(", ")}`);

  const docs = corpus(); // fails early with a clear message if the corpus isn't uploaded
  const corpusTokens = docs.reduce((a, d) => a + d.chars, 0) / 4;
  const perModel = (m: string) => {
    const p = PRICES[m];
    const turns = personas.length * 5; // 4 replies + 1 reflection per persona
    return (corpusTokens * (2 * p.cacheWrite + turns * p.cacheRead) + turns * (1500 * p.input + 600 * p.output)) / 1e6;
  };
  const estimate = models.reduce((a, m) => a + perModel(m), 0);
  console.log(`${models.length} model(s) × ${personas.length} conversation(s): ${models.join(", ")}`);
  console.log(`Corpus: ${docs.length} documents, ~${Math.round(corpusTokens / 1000)}k tokens. Estimated cost: ~$${estimate.toFixed(2)}.`);
  if (!process.argv.includes("--yes")) {
    console.log("Nothing run. Add --yes to run it.");
    return;
  }

  const runs: Run[] = [];
  for (const m of models) {
    process.stdout.write(`\n${m} `);
    // One model at a time, so its cached corpus is reused across conversations.
    for (const p of personas) runs.push(await runOne(m, p));
  }
  const dir = path.join(process.cwd(), "evals", "out", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "report.md"), report(runs, models, personas));
  fs.writeFileSync(path.join(dir, "runs.json"), JSON.stringify(runs, null, 2));
  const spent = runs.reduce((a, r) => a + r.cost, 0);
  console.log(`\n\nDone. Estimated spend: $${spent.toFixed(2)}. Report: ${path.relative(process.cwd(), dir)}/report.md`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
