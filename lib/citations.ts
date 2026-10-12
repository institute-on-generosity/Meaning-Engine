// Shared by the server and the browser: keep this file free of Node imports.

/** Tags the model cited, like [S1] or [S1, S3], in order of first appearance. */
export function citedTags(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/\[(S\d+(?:\s*,\s*S\d+)*)\]/g)) {
    for (const tag of m[1].split(/\s*,\s*/)) seen.add(tag);
  }
  return [...seen];
}
