import { describe, expect, it } from "vitest";
import { modeOf, secondsOf } from "@/lib/events";

describe("event fields from the browser", () => {
  it("clamps session length to 0–24 hours and ignores junk", () => {
    expect(secondsOf({ seconds: 312.4 })).toBe(312);
    expect(secondsOf({ seconds: -5 })).toBe(0);
    expect(secondsOf({ seconds: 10_000_000 })).toBe(86_400);
    expect(secondsOf({ seconds: "abc" })).toBe(0);
    expect(secondsOf({})).toBe(0);
    expect(secondsOf(null)).toBe(0);
  });

  it("only accepts kiosk as the alternative mode", () => {
    expect(modeOf({ mode: "kiosk" })).toBe("kiosk");
    expect(modeOf({ mode: "admin" })).toBe("web");
  });
});
