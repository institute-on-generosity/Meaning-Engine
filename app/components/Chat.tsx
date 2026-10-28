"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { citedTags, type Citation } from "@/lib/citations";
import type { Reflection } from "@/lib/reflection";

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; sources: Citation[]; streaming?: boolean }
  | { role: "system"; kind: "crisis" | "notice" | "error"; content: string };

interface Props {
  opening: string;
  reflectionAfter: number;
  maxChars: number;
  /** Shared-screen mode for convenings: clears itself when idle and offers no downloads. */
  kiosk?: { idleSeconds: number; warningSeconds: number };
}

export default function Chat({ opening, reflectionAfter, maxChars, kiosk }: Props) {
  const mode = kiosk ? "kiosk" : "web";
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflectionError, setReflectionError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastActivity = useRef(Date.now());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
  }, [messages, reflection, reflecting]);

  useEffect(() => {
    if (started && !busy) inputRef.current?.focus();
  }, [started, busy]);

  // Kiosk: after `idleSeconds` without activity, clear everything for the next person.
  useEffect(() => {
    if (!kiosk || !started) return;
    const bump = () => {
      lastActivity.current = Date.now();
      setCountdown(null);
    };
    const events = ["pointerdown", "keydown", "input", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    bump();
    const timer = setInterval(() => {
      const left = kiosk.idleSeconds - Math.floor((Date.now() - lastActivity.current) / 1000);
      if (left <= 0) clearAll();
      else setCountdown(left <= kiosk.warningSeconds ? left : null);
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, [kiosk, started]);

  // A reply or reflection arriving counts as activity, so nobody is cleared mid-read.
  useEffect(() => {
    lastActivity.current = Date.now();
  }, [messages, reflection, busy, reflecting]);

  const userTurns = messages.filter((m) => m.role === "user").length;

  /** The conversation as the API sees it: only real user and assistant turns. */
  function transcript(list: Message[]) {
    return list
      .filter((m): m is Exclude<Message, { role: "system" }> => m.role !== "system" && m.content.trim() !== "")
      .map(({ role, content }) => ({ role, content }));
  }

  function updateLast(fn: (m: Message) => Message) {
    setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setReflection(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: transcript(next), mode }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Something went wrong. Please try again.");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "", sources: [], streaming: true }]);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "citation") {
            updateLast((m) => (m.role === "assistant" ? { ...m, sources: [...m.sources, event.citation] } : m));
          } else if (event.type === "text") {
            updateLast((m) => (m.role === "assistant" ? { ...m, content: m.content + event.text } : m));
          } else if (event.type === "crisis" || event.type === "notice" || event.type === "error") {
            setMessages((prev) => [
              ...prev.filter((m) => !(m.role === "assistant" && m.streaming && !m.content)),
              { role: "system", kind: event.type, content: event.text },
            ]);
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev.filter((m) => !(m.role === "assistant" && m.streaming && !m.content)),
        { role: "system", kind: "error", content: err instanceof Error ? err.message : String(err) },
      ]);
    } finally {
      setMessages((prev) =>
        prev
          .filter((m) => !(m.role === "assistant" && m.streaming && !m.content))
          .map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m)),
      );
      setBusy(false);
    }
  }

  async function reflect() {
    setReflecting(true);
    setReflectionError(null);
    try {
      const res = await fetch("/api/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: transcript(messages), mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setReflection(data);
    } catch (err) {
      setReflectionError(err instanceof Error ? err.message : String(err));
    } finally {
      setReflecting(false);
    }
  }

  function clearConversation() {
    setMessages([]);
    setReflection(null);
    setReflectionError(null);
    setDraft("");
    setCountdown(null);
  }

  /** Back to the welcome screen with nothing left behind (kiosk end of session). */
  function clearAll() {
    clearConversation();
    setStarted(false);
    window.scrollTo(0, 0);
  }

  function restart() {
    const question = kiosk ? "End this session? Everything on screen will be cleared." : "Start over? This conversation will be cleared.";
    if (messages.length && !confirm(question)) return;
    if (kiosk) clearAll();
    else clearConversation();
  }

  if (!started) return <Intro kiosk={!!kiosk} onBegin={() => setStarted(true)} />;

  return (
    <div className="app">
      <Header onRestart={restart} restartLabel={kiosk ? "End session" : "Start over"} />
      {countdown !== null && (
        <div className="idle" role="alertdialog" aria-labelledby="idle-title">
          <div className="idle-card">
            <p id="idle-title" className="idle-title">Still there?</p>
            <p>
              This screen will clear for the next person in {countdown} {countdown === 1 ? "second" : "seconds"}.
            </p>
            <button
              className="btn-dark"
              autoFocus
              onClick={() => {
                lastActivity.current = Date.now();
                setCountdown(null);
              }}
            >
              I&rsquo;m still here
            </button>
          </div>
        </div>
      )}
      <div className="shell">
      <main className="thread" role="log" aria-live="polite" aria-labelledby="thread-title">
        <h1 id="thread-title" className="visually-hidden">
          Conversation with MeaningEngine
        </h1>
        <AssistantBubble content={opening} sources={[]} />
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">
              <span className="visually-hidden">You said: </span>
              <RichText text={m.content} />
            </div>
          ) : m.role === "assistant" ? (
            <AssistantBubble key={i} content={m.content} sources={m.sources} streaming={m.streaming} />
          ) : (
            <div key={i} className={`msg system ${m.kind}`} role={m.kind === "crisis" ? "alert" : undefined}>
              <RichText text={m.content} />
            </div>
          ),
        )}
        {busy && messages[messages.length - 1]?.role === "user" && (
          <div className="msg assistant typing" role="status" aria-label="MeaningEngine is thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        {reflecting && <p className="status">Writing your reflection…</p>}
        {reflectionError && <p className="status error">{reflectionError}</p>}
        {reflection && (
          <>
            <ReflectionCard reflection={reflection} kiosk={!!kiosk} onFinish={clearAll} />
            <SurveyCard turns={userTurns} mode={mode} />
          </>
        )}
        <div ref={endRef} />
      </main>

      <footer className="composer">
        {userTurns >= reflectionAfter && !reflection && (
          <button className="reflect" onClick={reflect} disabled={busy || reflecting}>
            {reflecting ? "Writing your reflection…" : "Create my reflection"}
          </button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="message" className="visually-hidden">
            Your message
          </label>
          <textarea
            id="message"
            ref={inputRef}
            value={draft}
            maxLength={maxChars}
            rows={2}
            placeholder="Write as much or as little as you like…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
        <p className="fineprint">
          An AI reflection tool, not a therapist or financial advisor. In crisis? Call or text 988 (US).
          {kiosk ? (
            " This screen clears itself after a few minutes without activity."
          ) : (
            <>
              {" "}
              <a href="/about" target="_blank" rel="noreferrer">
                About &amp; privacy
              </a>
            </>
          )}
        </p>
      </footer>
      </div>
    </div>
  );
}

function Header({ onRestart, restartLabel = "Start over" }: { onRestart?: () => void; restartLabel?: string }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="org">Institute on Generosity</span>
          <span className="product">MeaningEngine · a reflection on your giving</span>
        </div>
        {onRestart && (
          <button className="ghost" onClick={onRestart}>
            {restartLabel}
          </button>
        )}
      </div>
    </header>
  );
}

const STAGES = [
  ["Opening", "What brought you here, and what's on your mind about giving right now."],
  ["Story", "Moments that felt meaningful, ones that felt like obligation, and who taught you to give."],
  ["Values", "What those moments reveal about what you care about."],
  ["Tensions", "What you're unsure about or pulled between: near or far, now or later, head or heart."],
  ["Intention", "One small, concrete practice you want to try, and a written reflection to keep."],
];

function Intro({ onBegin, kiosk }: { onBegin: () => void; kiosk: boolean }) {
  return (
    <div className="app">
      <Header />
      <section className="hero">
        <div className="hero-inner">
          <span className="chip">Reflection tool</span>
          <h1>What makes your giving meaningful?</h1>
          <div className="hero-cols">
            <p className="lede">
              A guided conversation to help you think more intentionally about why you give, what you care about, and
              what you&rsquo;re unsure about. It draws on the Institute on Generosity&rsquo;s research and Giving Guides.
            </p>
            <p className="aside">
              MeaningEngine asks questions; it doesn&rsquo;t hand you answers. It won&rsquo;t tell you where or how much to
              give. You decide.
            </p>
          </div>
          <dl className="stats">
            <div>
              <dt>10–15</dt>
              <dd>Minutes</dd>
            </div>
            <div>
              <dt>5</dt>
              <dd>Stages of reflection</dd>
            </div>
            <div>
              <dt>Private</dt>
              <dd>Nothing is saved</dd>
            </div>
          </dl>
          <button className="btn-dark" onClick={onBegin}>
            Begin the reflection →
          </button>
        </div>
      </section>

      <section className="dark">
        <div className="dark-inner">
          <div>
            <p className="eyebrow">How it works</p>
            <h2>One conversation, start to finish</h2>
            <p className="dark-lede">One question at a time, at your pace. You can stop whenever you like.</p>
            <ul className="fine">
              <li>It&rsquo;s an AI, not a therapist or a financial advisor, and it can be wrong.</li>
              <li>When it shares IoG research it cites the source so you can check.</li>
              <li>
                {kiosk
                  ? "Your conversation is cleared from this screen when you finish or step away."
                  : "Your conversation disappears when you close this page."}
              </li>
              <li>
                In crisis or thinking about harming yourself? Call or text <strong>988</strong> (US) or visit
                findahelpline.com.
              </li>
              <li>
                <Link href={kiosk ? "/about?from=kiosk" : "/about"}>About MeaningEngine &amp; your privacy</Link>
              </li>
            </ul>
            <button className="btn-lime" onClick={onBegin}>
              Begin →
            </button>
          </div>
          <ol className="stages">
            {STAGES.map(([name, text], i) => (
              <li key={name}>
                <span className="stage-num">Stage {i + 1}</span>
                <div>
                  <h3>{name}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

function AssistantBubble({ content, sources, streaming }: { content: string; sources: Citation[]; streaming?: boolean }) {
  const cited = streaming ? [] : citedTags(content).flatMap((t) => sources.find((s) => s.tag === t) ?? []);
  return (
    <div className="msg assistant">
      <span className="visually-hidden">MeaningEngine: </span>
      <RichText text={content} sources={sources} />
      {cited.length > 0 && (
        <ol className="sources" aria-label="Sources">
          {cited.map((s) => (
            <li key={s.tag}>
              <SourceLine source={s} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const QUOTE_CHARS = 240;

function SourceLine({ source }: { source: Citation }) {
  const quote = source.quote.length > QUOTE_CHARS ? `${source.quote.slice(0, QUOTE_CHARS).trimEnd()}…` : source.quote;
  return (
    <>
      <span className="tag">{source.tag}</span> <span className="source-title">{source.title}</span>
      {quote && <q className="source-quote">{quote}</q>}
    </>
  );
}

/** Paragraphs, "- " bullet lists, **bold**, and [S1] citation markers. No HTML is injected. */
function RichText({ text, sources = [] }: { text: string; sources?: Citation[] }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.replace(/^\s*[-*] /, "")} sources={sources} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l} sources={sources} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function Inline({ text, sources }: { text: string; sources: Citation[] }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[S\d+(?:\s*,\s*S\d+)*\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
        const cite = part.match(/^\[(S\d+(?:\s*,\s*S\d+)*)\]$/);
        if (cite) {
          return (
            <sup key={i} className="cite">
              {cite[1].split(/\s*,\s*/).map((tag) => {
                const s = sources.find((x) => x.tag === tag);
                return (
                  <span key={tag} title={s?.title}>
                    {tag}
                  </span>
                );
              })}
            </sup>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function reflectionAsMarkdown(r: Reflection): string {
  const lines = [`# ${r.title}`, "", r.summary, ""];
  lines.push("## What you value", "", ...r.values.map((v) => `- **${v.value}**: ${v.evidence}`), "");
  lines.push("## Practices to try", "");
  for (const p of r.practices) {
    lines.push(`- **${p.practice}** ${p.why}`);
    for (const g of p.guides) lines.push(`  - From IoG's ${g}`);
  }
  lines.push("", "## Questions to keep", "", ...r.questions_to_keep.map((q) => `- ${q}`), "");
  lines.push(`_Created with MeaningEngine, Institute on Generosity, ${new Date(r.createdAt).toLocaleDateString()}._`);
  return lines.join("\n");
}

function ReflectionCard({ reflection: r, kiosk, onFinish }: { reflection: Reflection; kiosk: boolean; onFinish: () => void }) {
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([reflectionAsMarkdown(r)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-giving-reflection.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copy() {
    await navigator.clipboard.writeText(reflectionAsMarkdown(r));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <article className="reflection" aria-label="Your giving reflection">
      <p className="eyebrow">Your giving reflection</p>
      <h2>{r.title}</h2>
      <RichText text={r.summary} />

      <h3>What you value</h3>
      <ul>
        {r.values.map((v) => (
          <li key={v.value}>
            <strong>{v.value}.</strong> {v.evidence}
          </li>
        ))}
      </ul>

      <h3>Practices to try</h3>
      <ul>
        {r.practices.map((p) => (
          <li key={p.practice}>
            <strong>{p.practice}</strong> {p.why}
            {p.guides.length > 0 && (
              <ul className="sources">
                {p.guides.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <h3>Questions to keep</h3>
      <ul>
        {r.questions_to_keep.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>

      {/* On a shared kiosk screen, nothing is saved to the device: print, then clear. */}
      <div className="actions">
        {kiosk ? (
          <>
            <button onClick={() => window.print()}>Print</button>
            <button onClick={onFinish}>Finish and clear the screen</button>
          </>
        ) : (
          <>
            <button onClick={download}>Download</button>
            <button onClick={copy}>{copied ? "Copied" : "Copy text"}</button>
            <button onClick={() => window.print()}>Print</button>
          </>
        )}
      </div>
    </article>
  );
}

const RATINGS = [
  ["insightful", "Insightful"],
  ["useful", "Useful"],
  ["neutral", "Neutral"],
  ["not_useful", "Not useful"],
] as const;

/** One-question post-session survey (the proposal's "insightful or useful" metric). Anonymous. */
function SurveyCard({ turns, mode }: { turns: number; mode: "web" | "kiosk" }) {
  const [rating, setRating] = useState<(typeof RATINGS)[number][0] | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit() {
    if (!rating) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, turns, mode }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <section className="survey" aria-live="polite">
        <p className="survey-thanks">Thank you. Your answer helps IoG improve MeaningEngine.</p>
      </section>
    );
  }

  return (
    <section className="survey" aria-labelledby="survey-q">
      <p className="eyebrow">One quick question</p>
      <p id="survey-q" className="survey-q">
        How would you describe this conversation?
      </p>
      <div className="ratings" role="group" aria-labelledby="survey-q">
        {RATINGS.map(([value, label]) => (
          <button
            key={value}
            aria-pressed={rating === value}
            className={rating === value ? "rating selected" : "rating"}
            onClick={() => setRating(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <label htmlFor="survey-comment" className="survey-label">
        Anything else? <span>(optional, anonymous)</span>
      </label>
      <textarea
        id="survey-comment"
        value={comment}
        maxLength={1000}
        rows={2}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="survey-actions">
        <button className="btn-dark" onClick={submit} disabled={!rating || status === "sending"}>
          {status === "sending" ? "Sending…" : "Send"}
        </button>
        {status === "error" && <span className="survey-error">That didn&rsquo;t go through. Please try again.</span>}
      </div>
    </section>
  );
}
