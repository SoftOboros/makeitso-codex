import fs from "fs";
import path from "path";

export function readRepoSummary(root = ".", maxEntries = 200, maxDepth = 2): string {
  try {
    const entries: string[] = [];
    const seen = new Set<string>();
    const walk = (dir: string, depth: number) => {
      if (entries.length >= maxEntries || depth > maxDepth) return;
      let ents: fs.Dirent[] = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (entries.length >= maxEntries) break;
        if (e.name.startsWith(".")) continue; // skip dotfiles
        const p = path.join(dir, e.name);
        if (seen.has(p)) continue;
        seen.add(p);
        entries.push(p);
        if (e.isDirectory()) walk(p, depth + 1);
      }
    };
    walk(root, 0);
    return entries.slice(0, maxEntries).join("\n");
  } catch {
    return "";
  }
}

export function loadThreadSummary(dir = ".makeitso/sessions", maxSnapshots = 3, maxChars = 600): string {
  try {
    if (!fs.existsSync(dir)) return "";
    const files = fs.readdirSync(dir)
      .filter((f) => /^session_\d+\.json$/.test(f))
      .sort((a, b) => Number(b.match(/(\d+)/)?.[1] || 0) - Number(a.match(/(\d+)/)?.[1] || 0))
      .slice(0, maxSnapshots);
    const items: string[] = [];
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
        const ts = new Date(j.ts || 0).toISOString();
        const dec = j.decision?.status || "?";
        const reason = j.decision?.reason ? String(j.decision.reason) : "";
        const arts = Array.isArray(j.artifacts) ? j.artifacts.length : 0;
        const line = `[${ts}] status=${dec} artifacts=${arts}${reason ? ` reason=${reason}` : ""}`;
        items.push(line);
      } catch { /* ignore */ }
    }
    const text = items.join("\n");
    return text.length > maxChars ? text.slice(0, maxChars) + " …" : text;
  } catch {
    return "";
  }
}

export function readBootstrapDoc(baseNameEnv = 'MIS_BOOTSTRAP', defaultBase = 'BOOTSTRAP.md', maxChars = 8000): { name: string; content: string } | undefined {
  try {
    const base = process.env[baseNameEnv] || defaultBase;
    const p = path.resolve(base);
    if (!fs.existsSync(p)) return undefined;
    const raw = fs.readFileSync(p, 'utf-8');
    const content = raw.length > maxChars ? raw.slice(0, maxChars) + ' …' : raw;
    return { name: path.basename(base), content };
  } catch { return undefined; }
}
