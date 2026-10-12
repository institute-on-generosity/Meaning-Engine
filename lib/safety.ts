import { safetyConfig } from "./config";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
}

/** True if the message contains any configured crisis phrase (whole-word match). */
export function detectCrisis(text: string, phrases = safetyConfig().crisis_phrases): boolean {
  const haystack = normalize(text);
  return phrases.some((phrase) => {
    const escaped = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`).test(haystack);
  });
}
