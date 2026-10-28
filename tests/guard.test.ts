import { describe, expect, it } from "vitest";
import { clientIp, rateLimit, sameOrigin } from "@/lib/guard";

const req = (headers: Record<string, string>) => new Request("http://x/api/chat", { method: "POST", headers });

describe("rateLimit", () => {
  it("allows up to the limit in the window, then blocks until the oldest call ages out", () => {
    const key = `t-${Math.random()}`;
    expect(rateLimit(key, 2, 1000, 0).ok).toBe(true);
    expect(rateLimit(key, 2, 1000, 100).ok).toBe(true);
    const blocked = rateLimit(key, 2, 1000, 200);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(rateLimit(key, 2, 1000, 1001).ok).toBe(true);
  });

  it("counts each key separately", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(rateLimit(a, 1, 1000, 0).ok).toBe(true);
    expect(rateLimit(a, 1, 1000, 1).ok).toBe(false);
    expect(rateLimit(b, 1, 1000, 1).ok).toBe(true);
  });
});

describe("sameOrigin", () => {
  it("accepts requests from this site and rejects other sites", () => {
    expect(sameOrigin(req({ origin: "https://meaning.example.org", host: "meaning.example.org" }))).toBe(true);
    expect(sameOrigin(req({ origin: "https://evil.example.com", host: "meaning.example.org" }))).toBe(false);
    expect(sameOrigin(req({ origin: "not a url", host: "meaning.example.org" }))).toBe(false);
  });
});

describe("clientIp", () => {
  it("uses the first forwarded address", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(req({}))).toBe("local");
  });
});
