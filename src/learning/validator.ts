import fs from "fs";
import path from "path";
import { Pattern, loadPatternLibrary } from "../parser/regexEngine";

export interface CoverageReport {
  files: number;
  lines: number;
  covered: number;
  percent: number; // 0..100
}

export function validateCoverage(replaysDir: string, patterns: Pattern[]): CoverageReport {
  const ents = fs.existsSync(replaysDir) ? fs.readdirSync(replaysDir) : [];
  const logs = ents.filter((f) => /_stdout\.log$/.test(f));
  let totalLines = 0;
  let coveredLines = 0;
  // Build block regexes to mark covered regions
  const toRegExp = (p: any) => new RegExp(p.regex, (p.reflags || []).join("") || undefined);
  const blockNames = ["json_block", "error_block", "start_end_block"];
  const blockPatterns = blockNames
    .map((n) => patterns.find((p) => p.name === n))
    .filter(Boolean)
    .map(toRegExp) as RegExp[];

  for (const f of logs) {
    const text = fs.readFileSync(path.join(replaysDir, f), "utf-8");
    const covered = new Array(text.length).fill(false);
    for (const rx of blockPatterns) {
      let m: RegExpExecArray | null;
      const grx = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");
      while ((m = grx.exec(text)) !== null) {
        const s = m.index;
        const e = grx.lastIndex;
        for (let i = s; i < e; i++) covered[i] = true;
      }
    }
    let start = 0;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const end = start + line.length;
      const lineCovered = covered.slice(start, end).some(Boolean);
      totalLines++;
      if (lineCovered) coveredLines++;
      start = end + 1;
    }
  }
  const percent = totalLines ? ((coveredLines / totalLines) * 100) : 0;
  return { files: logs.length, lines: totalLines, covered: coveredLines, percent: Math.round(percent * 10) / 10 };
}

export function loadPatternsOrDefault(tomlPath: string): Pattern[] {
  try { return loadPatternLibrary(tomlPath); } catch {
    return [
      { name: "json_block", intent: "extract-json", regex: "<<MIS:JSON>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
      { name: "error_block", intent: "extract-error", regex: "<<MIS:ERR>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
      { name: "start_end_block", intent: "extract-block", regex: "<<MIS:START>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
    ];
  }
}

