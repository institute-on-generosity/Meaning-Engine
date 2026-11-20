import { describe, expect, it } from "vitest";
import { advisorDocuments, advisorFor, advisors, conversationSystem, reflectionSystem } from "@/lib/advisors";
import { corpus } from "@/lib/config";

describe("advisors", () => {
  it("are defined, with unique ids", () => {
    const ids = advisors().map((a) => a.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("read only guides that are uploaded", () => {
    for (const a of advisors()) expect(() => advisorDocuments(a)).not.toThrow();
  });

  it("together cover every uploaded guide", () => {
    const covered = new Set(advisors().flatMap((a) => a.guides));
    const missing = corpus().map((d) => d.source).filter((s) => !covered.has(s));
    expect(missing).toEqual([]);
  });

  it("fall back to the first advisor for a missing or unknown id", () => {
    expect(advisorFor(undefined).id).toBe(advisors()[0].id);
    expect(advisorFor("no-such-advisor").id).toBe(advisors()[0].id);
    expect(advisorFor({ id: "evaluation" }).id).toBe(advisors()[0].id);
    expect(advisorFor("evaluation").id).toBe("evaluation");
  });

  it("build instructions that carry the advisor's focus, button and opening", () => {
    const a = advisorFor("strategy");
    const system = conversationSystem(a);
    expect(system).toContain("## This advisor");
    expect(system).toContain(a.focus.trim().slice(0, 40));
    expect(system).toContain(`"${a.button_label}"`);
    expect(system).toContain(a.opening_message.trim().slice(0, 30));
    expect(reflectionSystem(a)).toContain(a.reflection_label);
  });
});
