import fs from "fs";
import path from "path";
import { Pattern } from "../parser/regexEngine";

export interface Proposal {
  patterns: Pattern[];
  rationale: string[];
}

/**
 * Heuristic proposer: ensures global flag (g) on core patterns and aligns library.
 */
export function proposeImprovements(current: Pattern[]): Proposal | undefined {
  const rationale: string[] = [];
  const wantedNames = new Set(["json_block", "error_block", "start_end_block"]);
  const amended: Pattern[] = current.map((p) => ({ ...p, reflags: Array.isArray(p.reflags) ? [...p.reflags] : [] }));
  let changed = false;
  for (const p of amended) {
    if (wantedNames.has(p.name)) {
      const flags = p.reflags || [];
      if (!flags.includes("g")) { flags.push("g"); p.reflags = flags; changed = true; rationale.push(`Added 'g' flag to ${p.name} for multi-block extraction.`); }
      if (!flags.includes("s")) { flags.push("s"); p.reflags = flags; changed = true; rationale.push(`Added 's' flag to ${p.name} for multiline extraction.`); }
    }
  }
  if (!changed) return undefined;
  return { patterns: amended, rationale };
}

export function writeProposalToml(proposal: Proposal, outPath: string) {
  // Minimal TOML writer for Pattern[]
  const lines: string[] = [];
  for (const p of proposal.patterns) {
    lines.push("[[pattern]]");
    lines.push(`name = "${p.name}"`);
    lines.push(`intent = "${p.intent}"`);
    // Escape backslashes and quotes in regex
    const rx = p.regex.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(`regex = "${rx}"`);
    if (p.multiline !== undefined) lines.push(`multiline = ${p.multiline ? "true" : "false"}`);
    const flags = (p.reflags || []) as string[];
    lines.push(`reflags = [${flags.map((f) => `"${f}"`).join(", ")}]`);
    lines.push("");
  }
  fs.writeFileSync(outPath, lines.join("\n"));
}

