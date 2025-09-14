#!/usr/bin/env node
/*
 SPDX-License-Identifier: MIT
 File: bin/mis.ts
 Description: Auto-generated header for documentation and compliance.
*/
/**
 * Minimal CLI for makeitso-codex.
 *
 * Commands:
 *   mis init                 - scaffold config and protocol files
 *   mis plan <goal>          - generate a plan (no execution)
 *   mis run <goal>           - execute goal using current config and approvals
 *   mis audit                - print (placeholder) telemetry summary
 *   mis learn                - run (placeholder) learning pass
 *
 * NOTE: This is a starter CLI. Replace placeholders as features land.
 */

import fs from "fs";
import path from "path";
import { chdir } from "process";
// Defer loading heavy modules (and deps like 'toml') to commands that need them

// Raw argv (excluding node and script)
const raw = process.argv.slice(2);

// Resolve package root regardless of ts-node vs compiled dist
function resolvePackageRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", ".."), // dist/bin -> package root
    path.resolve(__dirname, ".."),        // bin -> package root (ts-node)
  ];
  for (const p of candidates) {
    try {
      const pkg = path.join(p, "package.json");
      if (fs.existsSync(pkg)) return p;
    } catch {}
  }
  // Fallback: current working directory
  return process.cwd();
}

// Optional working directory override: --cwd=<path> or --cwd <path>
// Parse from raw directly so we can chdir before any file I/O
const rawFlags = raw.filter((a) => a.startsWith("-"));
const cwdFlag = rawFlags.find((f) => f === "--cwd" || f.startsWith("--cwd="));
if (cwdFlag) {
  const eqVal = cwdFlag.includes("=") ? cwdFlag.split("=", 2)[1] : undefined;
  const idx = raw.indexOf(cwdFlag);
  const nextVal = raw[idx + 1] && !raw[idx + 1].startsWith("-") ? raw[idx + 1] : undefined;
  const target = path.resolve(eqVal || nextVal || ".");
  try { chdir(target); }
  catch (e: any) { console.error(`Failed to chdir to --cwd ${target}: ${e?.message || e}`); process.exit(2); }
} else {
  // Default: run as if cwd = project root
  const pkgRoot = resolvePackageRoot();
  try { chdir(pkgRoot); } catch {}
}

// Now split args carefully, skipping values that belong to known flags
const valueFlags = new Set(["--cwd", "--inspect-url", "--codex-key", "--profile", "--child-arg", "--child-args"]);
valueFlags.add("--profile");
const flags: string[] = [];
const positional: string[] = [];
for (let i = 0; i < raw.length; i++) {
  const tok = raw[i];
  if (tok.startsWith("-")) {
    flags.push(tok);
    const name = tok.includes("=") ? tok.split("=", 2)[0] : tok;
    const hasEq = tok.includes("=");
    if (valueFlags.has(name) && !hasEq) {
      const next = raw[i + 1];
      if (next && !next.startsWith("-")) i++; // skip value token
    }
  } else {
    positional.push(tok);
  }
}
const cmd = positional[0];
const rest = positional.slice(1);

// Global flags
if (flags.includes("--non-interactive") || flags.includes("-y")) {
  process.env.MIS_AUTO_APPROVE = process.env.MIS_AUTO_APPROVE || "1";
}
if (flags.includes("--force-stub")) {
  process.env.MIS_FORCE_STUB = process.env.MIS_FORCE_STUB || "1";
}
// Verbose logging flag: enable debug logs across the process
if (flags.includes("--verbose") || flags.includes("-v")) {
  process.env.MIS_VERBOSE = "1";
}
// Debug inspector URL override: --inspect-url=<ws://...> or --inspect-url <ws://...>
const inspectFlag = flags.find((f) => f.startsWith("--inspect-url"));
if (inspectFlag) {
  const eq = inspectFlag.split("=", 2)[1];
  const nextIdx = raw.indexOf(inspectFlag) + 1;
  const val = eq || raw[nextIdx];
  if (val && !val.startsWith("-")) {
    process.env.MIS_INSPECT_URL = val;
  }
}

// Runtime profile: --profile dev|debug|ci
const profileFlag = flags.find((f) => f.startsWith("--profile"));
if (profileFlag) {
  const eq = profileFlag.split("=", 2)[1];
  const nextIdx = raw.indexOf(profileFlag) + 1;
  const val = (eq || raw[nextIdx] || "").toLowerCase();
  if (val && !val.startsWith("-")) {
    process.env.MIS_PROFILE = val;
  }
}

// Convenience: --dangerous-full-auto-self-driving-mode (playful but real)
if (flags.includes("--dangerous-full-auto-self-driving-mode")) {
  // Approvals auto, pick CI-like defaults, and signal orchestrator to remove iteration friction
  process.env.MIS_FULL_AUTO = "1";
  process.env.MIS_AUTO_APPROVE = "1";
  if (!process.env.MIS_PROFILE) process.env.MIS_PROFILE = "ci";
}

// Child args: --child-arg <token> (repeatable) and/or --child-args "-y --no-color"
const childArgs: string[] = [];
for (let i = 0; i < raw.length; i++) {
  const t = raw[i];
  if (t === "--child-arg") {
    const v = raw[i + 1];
    if (v && !v.startsWith("-")) { childArgs.push(v); i++; }
  } else if (t.startsWith("--child-arg=")) {
    const v = t.split("=", 2)[1];
    if (v) childArgs.push(v);
  } else if (t === "--child-args") {
    const v = raw[i + 1];
    if (v && !v.startsWith("-")) { childArgs.push(...v.split(/\s+/).filter(Boolean)); i++; }
  } else if (t.startsWith("--child-args=")) {
    const v = t.split("=", 2)[1];
    if (v) childArgs.push(...v.split(/\s+/).filter(Boolean));
  }
}
if (childArgs.length) {
  process.env.MIS_CHILD_ARGS = JSON.stringify(childArgs);
}

// (legacy --bootstrap flag removed; use `mis bootstrap <goal> [BASE.md]` instead)

const CONFIG_PATH = path.resolve("config.toml");
const PKG_ROOT = resolvePackageRoot(); // package root after build or ts-node

async function main() {
  // Wizard mode: no command → guide user
  if (!cmd) {
    await wizard();
    return;
  }
  // Process codex key override if provided
  const codexKeyIdx = raw.findIndex((a) => a === "--codex-key");
  if (codexKeyIdx >= 0) {
    const key = raw[codexKeyIdx + 1];
    if (key && !key.startsWith("-")) {
      try {
        const { loadConfig } = await import("../src/config");
        const cfg = loadConfig(CONFIG_PATH);
        const envName = cfg.workers?.codex?.api_key_env || "CODEX_API_KEY";
        (process.env as any)[envName] = key;
      } catch {
        process.env.CODEX_API_KEY = key;
      }
    }
  }

  switch (cmd) {
    case "init":
      return init();
    case "bootstrap":
      return bootstrap(rest[0], rest[1]);
    case "plan-bootstrap":
      return planBootstrap(rest[0], rest[1]);
    case "profile":
      return showProfile();
    case "plan":
      return plan(rest.join(" ").trim());
    case "run":
      return run(rest.join(" ").trim());
    case "audit":
      return audit();
    case "learn":
      return learn();
    case "open":
      return openUrlCmd(rest[0]);
    case "approve":
      return approve(rest[0]);
    default:
  console.log(`Usage:
  mis [--cwd <dir>] [--profile dev|debug|ci] [--dangerous-full-auto-self-driving-mode] [--verbose|-v] [--non-interactive|-y] [--force-stub] init
  mis profile
  mis bootstrap <goal> [BASE.md]
  mis plan-bootstrap <goal> [BASE.md]
  mis [--cwd <dir>] [--profile dev|debug|ci] [--dangerous-full-auto-self-driving-mode] [--child-arg <tok> ...] [--child-args "..."] [--verbose|-v] [--non-interactive|-y] [--force-stub] plan <goal>
  mis [--cwd <dir>] [--profile dev|debug|ci] [--dangerous-full-auto-self-driving-mode] [--child-arg <tok> ...] [--child-args "..."] [--verbose|-v] [--non-interactive|-y] [--force-stub] run <goal>
  mis open <url>
  mis audit
  mis learn`);
  }
}

/** Scaffold config and protocol files if missing. */
function init() {
  // Write config.toml from package template if missing
  if (!fs.existsSync("config.toml")) {
    const samplePath = path.join(PKG_ROOT, "examples", "config.example.toml");
    const sample = fs.readFileSync(samplePath, "utf-8");
    fs.writeFileSync("config.toml", sample);
    console.log("Created config.toml");
  } else {
    console.log("config.toml already exists");
  }

  // Ensure protocol directory
  fs.mkdirSync("protocol", { recursive: true });

  // Copy protocol templates from package into local project if missing
  const srcAgents = path.join(PKG_ROOT, "protocol", "AGENTS.md");
  const dstAgents = path.join("protocol", "AGENTS.md");
  if (!fs.existsSync(dstAgents)) {
    fs.copyFileSync(srcAgents, dstAgents);
    console.log("Wrote protocol/AGENTS.md");
  }

  const srcRegexes = path.join(PKG_ROOT, "protocol", "regexes.toml");
  const dstRegexes = path.join("protocol", "regexes.toml");
  if (!fs.existsSync(dstRegexes)) {
    fs.copyFileSync(srcRegexes, dstRegexes);
    console.log("Wrote protocol/regexes.toml");
  }

  console.log("Initialized protocol files.");
}

/** Generate a plan without executing it. */
async function plan(goal: string) {
  if (!goal) {
    console.error("Plan requires a <goal>.");
    process.exit(2);
  }
  const { Orchestrator } = await import("../src/orchestrator");
  const orch = new Orchestrator({ configPath: CONFIG_PATH });
  const p = await orch.plan(goal);
  console.log(JSON.stringify(p, null, 2));
  // Optional: write plan to file
  if (process.env.MIS_WRITE_PLAN === '1') {
    try {
      fs.mkdirSync('.makeitso', { recursive: true });
      const ts = Date.now();
      fs.writeFileSync(`.makeitso/plan_${ts}.json`, JSON.stringify(p, null, 2));
      console.log(`Wrote .makeitso/plan_${ts}.json`);
    } catch {}
  }
}

/** Show the active runtime profile and effective settings. */
async function showProfile() {
  const { loadConfig } = await import("../src/config");
  const cfg = loadConfig(CONFIG_PATH);
  const profile = pickProfile(cfg.ui?.profile);
  const eff = effectiveSettings(profile, cfg);
  const lines = [
    `Active profile: ${profile}`,
    `Workers.codex: stdin_only=${eff.stdin_only ? 'on' : 'off'}, interactive=${eff.interactive ? 'on' : 'off'}, plain=${eff.plain ? 'on' : 'off'}, timeout_ms=${eff.timeout_ms}`,
    `Logging: verbose=${eff.verbose ? 'on' : 'off'}, inplace=${eff.inplace ? 'on' : 'off'}`,
  ];
  console.log(lines.join("\n"));
}

function pickProfile(cfgProfile?: string): "dev" | "debug" | "ci" {
  const p = (process.env.MIS_PROFILE || cfgProfile || "").toLowerCase();
  if (p === "dev" || p === "debug" || p === "ci") return p as any;
  const isCI = process.env.CI === "1" || /true/i.test(process.env.CI || "");
  let inspector = false;
  try { const ins = require("inspector"); inspector = !!ins?.url?.(); } catch {}
  if (!inspector && Array.isArray(process.execArgv)) inspector = process.execArgv.some((a) => a.startsWith("--inspect"));
  if (!inspector && process.env.VSCODE_INSPECTOR_OPTIONS) inspector = true;
  return (isCI ? "ci" : ((inspector || process.env.MIS_VERBOSE === "1") ? "debug" : "dev"));
}

function effectiveSettings(profile: "dev" | "debug" | "ci", cfg: any) {
  const w = cfg?.workers?.codex || {};
  if (profile === "dev") {
    return {
      stdin_only: w.stdin_only !== false,
      interactive: false,
      plain: true,
      timeout_ms: w.timeout_ms || 15000,
      verbose: process.env.MIS_VERBOSE === "1",
      inplace: false,
    };
  } else if (profile === "debug") {
    return {
      stdin_only: true,
      interactive: false,
      plain: true,
      timeout_ms: w.timeout_ms || 15000,
      verbose: true,
      inplace: false,
    };
  } else {
    return {
      stdin_only: false,
      interactive: false,
      plain: true,
      timeout_ms: w.timeout_ms || 60000,
      verbose: false,
      inplace: false,
    };
  }
}

/** Execute a goal using the configured approval policy. */
async function run(goal: string) {
  if (!goal) {
    console.error("Run requires a <goal>.");
    process.exit(2);
  }
  const { Orchestrator } = await import("../src/orchestrator");
  const orch = new Orchestrator({ configPath: CONFIG_PATH });
  const code = await orch.run(goal);
  process.exit(code);
}

/** Seed planning from a bootstrap doc and then run phases as normal. */
async function bootstrap(goal?: string, baseName?: string) {
  if (!goal) {
    console.error("Bootstrap requires a <goal>.");
    process.exit(2);
  }
  (process.env as any).MIS_BOOTSTRAP = baseName && !baseName.startsWith('-') ? baseName : (process.env.MIS_BOOTSTRAP || 'BOOTSTRAP.md');
  const { Orchestrator } = await import("../src/orchestrator");
  const orch = new Orchestrator({ configPath: CONFIG_PATH });
  const code = await orch.run(goal);
  process.exit(code);
}

/** Plan-only bootstrap: seed planning from a bootstrap doc and print JSON (no execution). */
async function planBootstrap(goal?: string, baseName?: string) {
  if (!goal) {
    console.error("Plan-bootstrap requires a <goal>.");
    process.exit(2);
  }
  (process.env as any).MIS_BOOTSTRAP = baseName && !baseName.startsWith('-') ? baseName : (process.env.MIS_BOOTSTRAP || 'BOOTSTRAP.md');
  const { Orchestrator } = await import("../src/orchestrator");
  const orch = new Orchestrator({ configPath: CONFIG_PATH });
  const p = await orch.plan(goal);
  console.log(JSON.stringify(p, null, 2));
  if (process.env.MIS_WRITE_PLAN === '1') {
    try {
      fs.mkdirSync('.makeitso', { recursive: true });
      const ts = Date.now();
      fs.writeFileSync(`.makeitso/plan_${ts}.json`, JSON.stringify(p, null, 2));
      console.log(`Wrote .makeitso/plan_${ts}.json`);
    } catch {}
  }
}

/** Placeholder audit output. */
async function audit() {
  // Get artifacts dir from config if possible; fallback to default
  let artifactsDir = path.resolve(".makeitso", "artifacts");
  try {
    const { loadConfig } = await import("../src/config");
    const cfg = loadConfig(CONFIG_PATH);
    if (cfg?.project?.artifacts_dir) {
      artifactsDir = path.resolve(cfg.project.artifacts_dir);
    }
  } catch {
    // ignore, keep default
  }

  const replaysDir = path.resolve(".makeitso", "replays");
  const statDir = (dir: string) => {
    let files = 0;
    let bytes = 0;
    const ents = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    for (const f of ents) {
      const p = path.join(dir, f);
      try {
        const st = fs.statSync(p);
        if (st.isFile()) { files++; bytes += st.size; }
      } catch {}
    }
    return { files, bytes, entries: ents };
  };
  const rep = statDir(replaysDir);
  const art = statDir(artifactsDir);

  // Latest run timestamp from replays
  const tsList = rep.entries
    .map((f) => (f.match(/^(\d+)_stdout\.log$/)?.[1]))
    .filter(Boolean)
    .map((s) => Number(s as string))
    .sort((a, b) => b - a);
  const latestTs = tsList[0];
  let latestArtifacts = 0;
  let latestGoal: string | undefined;
  if (latestTs) {
    const rx = new RegExp(`^artifact_${latestTs}_(\\d+)\\.json(\\.txt)?$`);
    const arts = (fs.existsSync(artifactsDir) ? fs.readdirSync(artifactsDir) : []).filter((f) => rx.test(f));
    latestArtifacts = arts.length;
    // Try to read first JSON artifact goal
    const first = arts.find((f) => f.endsWith(".json"));
    if (first) {
      try {
        const obj = JSON.parse(fs.readFileSync(path.join(artifactsDir, first), "utf-8"));
        if (obj && typeof obj.goal === "string") latestGoal = obj.goal;
      } catch {}
    }
  }

  console.log(`Telemetry: ${rep.files} replays, ${(rep.bytes / 1024).toFixed(1)} KiB; ${art.files} artifacts, ${(art.bytes / 1024).toFixed(1)} KiB`);
  // Telemetry events summary (best-effort)
  try {
    const telDir = path.resolve(".makeitso", "telemetry");
    const telFile = path.join(telDir, "events.jsonl");
    let waits = 0, waitMs = 0, interrupts = 0, runs = 0, ok = 0, aborted = 0, totalStdout = 0, totalStderr = 0, totalDur = 0;
    if (fs.existsSync(telFile)) {
      const lines = fs.readFileSync(telFile, "utf-8").split(/\r?\n/).filter(Boolean);
      let lastWaitStart: number | undefined;
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          if (evt.type === "run_end") {
            runs++;
            if (typeof evt.data?.code === "number") {
              if (evt.data.code === 0) ok++; else if (evt.data.code === 2) aborted++;
            }
            if (typeof evt.data?.stdoutBytes === "number") totalStdout += evt.data.stdoutBytes;
            if (typeof evt.data?.stderrBytes === "number") totalStderr += evt.data.stderrBytes;
            if (typeof evt.data?.durationMs === "number") totalDur += evt.data.durationMs;
          }
          if (evt.type === "interrupt") interrupts++;
          if (evt.type === "wait_start") { waits++; lastWaitStart = evt.ts; if (evt.data?.ms) waitMs += Number(evt.data.ms) || 0; }
          if (evt.type === "wait_end" && lastWaitStart) { const dt = evt.ts - lastWaitStart; if (!isNaN(dt)) waitMs += dt; lastWaitStart = undefined; }
        } catch {}
      }
    }
    if (runs || waits || interrupts) {
      const avgDur = runs ? Math.round(totalDur / runs) : 0;
      const avgOut = runs ? Math.round(totalStdout / runs) : 0;
      const avgErr = runs ? Math.round(totalStderr / runs) : 0;
      console.log(`Events: runs=${runs} ok=${ok} aborted=${aborted} waits=${waits} (~${waitMs}ms) interrupts=${interrupts}`);
      console.log(`Averages: duration≈${avgDur}ms stdout≈${avgOut}B stderr≈${avgErr}B`);
    }
  } catch {}
  if (latestTs) {
    const when = new Date(latestTs).toISOString();
    console.log(`Latest run: ${when} — artifacts: ${latestArtifacts}${latestGoal ? ", goal: " + latestGoal : ""}`);
  }
  console.log(`Paths: replays=${replaysDir} artifacts=${artifactsDir}`);
}



/**
 * Simple interactive wizard to guide through planning or running a goal.
 */
async function wizard() {
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, (a: string) => res(a)));
  try {
    console.log('Welcome to Make It So, Codex — wizard mode');
    const g = (await ask('Enter your goal (e.g., "add eslint and fix ci"): ')).trim();
    if (!g) { console.error('No goal entered. Exiting.'); rl.close(); return; }
    const act = (await ask('Action [run/plan] (default: run): ')).trim().toLowerCase();
    rl.close();
    if (act === 'plan') {
      await plan(g);
    } else {
      await run(g);
    }
  } catch (e: any) {
    try { rl.close(); } catch {}
    console.error(e?.message || e);
    process.exit(1);
  }
}

/** Placeholder learning pass. */

async function openUrlCmd(url?: string) {
  if (!url) { console.error("Open requires a <url>."); process.exit(2); }
  const { loadConfig } = await import("../src/config");
  const cfg = loadConfig(CONFIG_PATH);
  const { PolicyEnforcer } = await import("../src/policy/enforcer");
  const { openUrl } = await import("../src/util/openUrl");
  const enforcer = new PolicyEnforcer(cfg.policies);
  await openUrl(url, cfg.ui, enforcer);
}
async function learn() {
  // Analyze replay logs and report coverage. If core patterns lack 'g', propose an update file.
  const replaysDir = path.resolve(".makeitso", "replays");
  const regexToml = path.resolve("protocol", "regexes.toml");
  const defaults = [
    { name: "json_block", intent: "extract-json", regex: "<<MIS:JSON>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
    { name: "error_block", intent: "extract-error", regex: "<<MIS:ERR>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
    { name: "start_end_block", intent: "extract-block", regex: "<<MIS:START>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
  ];
  let patterns = defaults as any[];
  try {
    const { loadPatternLibrary } = await import("../src/parser/regexEngine");
    patterns = loadPatternLibrary(regexToml);
  } catch {}

  const ents = fs.existsSync(replaysDir) ? fs.readdirSync(replaysDir) : [];
  const logs = ents.filter((f) => /_stdout\.log$/.test(f));
  if (logs.length === 0) {
    console.log("Learning: no replay logs found. Run `mis run <goal>` first.");
    return;
  }

  // Build block regexes to mark covered regions
  const toRegExp = (p: any) => new RegExp(p.regex, (p.reflags || []).join("") || undefined);
  const blockPatterns = ["json_block", "error_block", "start_end_block"]
    .map((n) => patterns.find((p) => p.name === n))
    .filter(Boolean)
    .map(toRegExp) as RegExp[];

  let totalLines = 0;
  let unmatchedLines = 0;
  const samples: string[] = [];

  for (const f of logs) {
    const text = fs.readFileSync(path.join(replaysDir, f), "utf-8");
    const covered = new Array(text.length).fill(false);
    for (const rx of blockPatterns) {
      let m: RegExpExecArray | null;
      // Ensure global matching
      const grx = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");
      while ((m = grx.exec(text)) !== null) {
        const s = m.index;
        const e = grx.lastIndex;
        for (let i = s; i < e; i++) covered[i] = true;
      }
    }
    // Compute line coverage
    let start = 0;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const end = start + line.length;
      const lineCovered = covered.slice(start, end).some(Boolean);
      totalLines++;
      if (!lineCovered && line.trim().length > 0) {
        unmatchedLines++;
        if (samples.length < 5) samples.push(line.slice(0, 120));
      }
      start = end + 1; // account for newline
    }
  }

  const pct = totalLines ? (((totalLines - unmatchedLines) / totalLines) * 100).toFixed(1) : "0.0";
  console.log(`Learning report: coverage ${pct}% (${totalLines - unmatchedLines}/${totalLines} lines covered by patterns)`);
  if (samples.length) {
    console.log("Sample unmatched lines:");
    for (const s of samples) console.log(`  - ${s}`);
  }

  // Propose improvements (ensure 'g' flag on core patterns)
  try {
    const { proposeImprovements, writeProposalToml } = await import("../src/learning/proposer");
    const prop = proposeImprovements(patterns as any);
    if (prop) {
      const outDir = path.resolve(".makeitso", "proposals");
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `regex_${Date.now()}.toml`);
      writeProposalToml(prop, outPath);
      console.log("Proposal: regex improvements suggested:");
      for (const r of prop.rationale) console.log(`  - ${r}`);
      console.log(`Approve via: npx mis approve ${outPath}`);
    }
  } catch {}
}

/**
 * Approve a proposed change. For now supports TOML proposals for regexes and copies
 * the proposal over protocol/regexes.toml (backing up the original).
 */
async function approve(file?: string) {
  if (!file) {
    console.error("Approve requires a <file> path.");
    process.exit(2);
  }
  const src = path.resolve(file);
  const dst = path.resolve("protocol", "regexes.toml");
  if (!fs.existsSync(src)) {
    console.error(`File not found: ${src}`);
    process.exit(2);
  }
  try {
    if (fs.existsSync(dst)) {
      const backup = dst + ".bak." + Date.now();
      fs.copyFileSync(dst, backup);
      console.log(`Backed up current regexes to ${backup}`);
    }
    fs.copyFileSync(src, dst);
    console.log(`Applied proposal to ${dst}`);
  } catch (e: any) {
    console.error(`Approve failed: ${e?.message || e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
