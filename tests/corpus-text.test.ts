import { describe, expect, it } from "vitest";
import { normalizeText } from "@/lib/corpus-text";

describe("normalizeText", () => {
  it("unifies line endings, trims trailing spaces, and collapses blank runs", () => {
    expect(normalizeText("Title  \r\n\r\n\r\n\r\nBody \nline\r\n\n\n")).toBe("Title\n\nBody\nline");
  });
});
