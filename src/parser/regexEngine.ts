/**
 * Regex-based parser for delimited Codex logs.
 *
 * Provides a small API to extract JSON, error, and generic blocks
 * delimited by tokens defined in config (e.g., <<MIS:JSON>>, <<MIS:END>>).
 */

export interface Pattern {
  name: string;
  intent: string;
  regex: string;
  multiline?: boolean;
  reflags?: string[];
}

/**
 * Extracts matches for a given pattern against the provided text.
 *
 * @param text Raw log text containing delimited blocks.
 * @param pattern A pattern descriptor with regex string and flags.
 * @returns Array of captured group(1) matches in source order.
 * @throws Error if the regex is invalid.
 */
export function extract(text: string, pattern: Pattern): string[] {
  const flags = (pattern.reflags || []).join("");
  const rx = new RegExp(pattern.regex, flags || undefined);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  if (!rx.global) {
    // emulate global extraction even if not provided
    const single = text.match(rx);
    if (single && single[1] !== undefined) out.push(single[1]);
    return out;
  }
  while ((m = rx.exec(text)) !== null) {
    if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}
