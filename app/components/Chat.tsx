"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { citedTags } from "@/lib/citations";
import type { Citation } from "@/lib/rag/types";
import type { Reflection } from "@/lib/reflection";

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; sources: Citation[]; streaming?: boolean }
  | { role: "system"; kind: "crisis" | "notice" | "error"; content: string };

interface Props {
  opening: string;
  reflectionAfter: number;
  maxChars: number;
}

export default function Chat({ opening, reflectionAfter, maxChars }: Props) {
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflectionError, setReflectionError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, reflection, reflecting]);

  useEffect(() => {
    if (started && !busy) inputRef.current?.focus();
  }, [started, busy]);

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
        body: JSON.stringify({ messages: transcript(next) }),
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
          if (event.type === "sources") {
            updateLast((m) => (m.role === "assistant" ? { ...m, sources: event.sources } : m));
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
        body: JSON.stringify({ messages: transcript(messages) }),
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

  function restart() {
    if (messages.length && !confirm("Start over? This conversation will be cleared.")) return;
    setMessages([]);
    setReflection(null);
    setReflectionError(null);
    setDraft("");
  }

  if (!started) return <Intro onBegin={() => setStarted(true)} />;

  return (
    <div className="shell">
      <Header onRestart={restart} />
      <main className="thread" aria-live="polite">
        <AssistantBubble content={opening} sources={[]} />
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">
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
          <div className="msg assistant typing" aria-label="MeaningEngine is thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        {reflecting && <p className="status">Writing your reflection…</p>}
        {reflectionError && <p className="status error">{reflectionError}</p>}
        {reflection && <ReflectionCard reflection={reflection} />}
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
        </p>
      </footer>
    </div>
  );
}

function Header({ onRestart }: { onRestart?: () => void }) {
  return (
    <header className="masthead">
      <div>
        <span className="wordmark">MeaningEngine</span>
        <span className="byline">Institute on Generosity</span>
      </div>
      {onRestart && (
        <button className="link" onClick={onRestart}>
          Start over
        </button>
      )}
    </header>
  );
}

function Intro({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="shell">
      <Header />
      <main className="intro">
        <h1>What makes your giving meaningful?</h1>
        <p className="lede">
          A guided conversation to help you think more intentionally about why you give, what you care about, and what
          you&rsquo;re unsure about. It draws on the Institute on Generosity&rsquo;s research and Giving Guides.
        </p>
        <ul className="ground-rules">
          <li>
            <strong>It takes about 10–15 minutes.</strong> At the end you can create a personal giving reflection to keep.
          </li>
          <li>
            <strong>It&rsquo;s a reflection companion, not a therapist or a financial advisor.</strong> It won&rsquo;t tell you
            where or how much to give.
          </li>
          <li>
            <strong>It&rsquo;s an AI.</strong> It can be wrong, and when it shares research it cites the source so you can
            check.
          </li>
          <li>
            <strong>Your conversation isn&rsquo;t saved.</strong> It disappears when you close this page.
          </li>
        </ul>
        <p className="crisis-note">
          If you&rsquo;re in crisis or thinking about harming yourself, please call or text <strong>988</strong> (US) or
          visit findahelpline.com.
        </p>
        <button className="primary" onClick={onBegin}>
          Begin
        </button>
      </main>
    </div>
  );
}

function AssistantBubble({ content, sources, streaming }: { content: string; sources: Citation[]; streaming?: boolean }) {
  const cited = streaming ? [] : citedTags(content).flatMap((t) => sources.find((s) => s.tag === t) ?? []);
  return (
    <div className="msg assistant">
      <RichText text={content} sources={sources} />
      {cited.length > 0 && (
        <ol className="sources">
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

function SourceLine({ source }: { source: Citation }) {
  const label = `${source.title}${source.page ? `, p. ${source.page}` : ""}`;
  return (
    <>
      <span className="tag">{source.tag}</span>{" "}
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer">
          {label}
        </a>
      ) : (
        label
      )}
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
    for (const s of p.sources) lines.push(`  - Source: ${s.title}${s.page ? `, p. ${s.page}` : ""}, ${s.publisher}${s.url ? ` ${s.url}` : ""}`);
  }
  lines.push("", "## Questions to keep", "", ...r.questions_to_keep.map((q) => `- ${q}`), "");
  lines.push(`_Created with MeaningEngine, Institute on Generosity, ${new Date(r.createdAt).toLocaleDateString()}._`);
  return lines.join("\n");
}

function ReflectionCard({ reflection: r }: { reflection: Reflection }) {
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
            {p.sources.length > 0 && (
              <ul className="sources">
                {p.sources.map((s) => (
                  <li key={s.tag}>
                    <SourceLine source={s} />
                  </li>
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

      <div className="actions">
        <button onClick={download}>Download</button>
        <button onClick={copy}>{copied ? "Copied" : "Copy text"}</button>
        <button onClick={() => window.print()}>Print</button>
      </div>
    </article>
  );
}
