import { describe, expect, it } from "vitest";
import { detectCrisis } from "@/lib/safety";

describe("detectCrisis", () => {
  it("flags configured phrases regardless of case and punctuation", () => {
    expect(detectCrisis("Honestly I want to die.")).toBe(true);
    expect(detectCrisis("I've been thinking about SUICIDE lately")).toBe(true);
    expect(detectCrisis("I don’t want to live like this")).toBe(true);
    expect(detectCrisis("sometimes I hurt myself")).toBe(true);
  });

  it("does not flag ordinary giving conversation", () => {
    expect(detectCrisis("I want to give more to my church")).toBe(false);
    expect(detectCrisis("My dad died last year and I give in his memory")).toBe(false);
  });

  it("errs on the side of caution when a cause mentions a crisis word", () => {
    // Known false positives; the professional review of config/safety.yaml decides the trade-off.
    expect(detectCrisis("I give to a suicide prevention charity")).toBe(true);
    expect(detectCrisis("The overdose epidemic hit my town")).toBe(true);
  });

  it("matches whole words only", () => {
    expect(detectCrisis("x", ["die"])).toBe(false);
    expect(detectCrisis("a diet plan", ["die"])).toBe(false);
    expect(detectCrisis("I could die", ["die"])).toBe(true);
  });
});
