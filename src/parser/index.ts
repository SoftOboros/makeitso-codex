/**
 * Parser facade: utilities to work with delimited logs using a TOML pattern library.
 */

import { extract, Pattern, loadPatternLibrary } from "./regexEngine";

export interface ParsedArtifacts {
  json: string[];
  errors: string[];
  blocks: string[];
}

/**
 * Parse delimited text using a pattern list.
 */
export function parseWithPatterns(text: string, patterns: Pattern[]): ParsedArtifacts {
  const byName = new Map(patterns.map((p) => [p.name, p] as const));
  const json = byName.has("json_block") ? extract(text, byName.get("json_block")!) : [];
  const errors = byName.has("error_block") ? extract(text, byName.get("error_block")!) : [];
  const blocks = byName.has("start_end_block") ? extract(text, byName.get("start_end_block")!) : [];
  return { json, errors, blocks };
}

/**
 * Convenience: load patterns from TOML file then parse.
 */
export function parseWithLibraryFile(text: string, tomlPath: string): ParsedArtifacts {
  const patterns = loadPatternLibrary(tomlPath);
  return parseWithPatterns(text, patterns);
}

export type { Pattern } from "./regexEngine";

