#!/usr/bin/env node
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
import { Orchestrator } from "../src/orchestrator";

const [, , cmd, ...rest] = process.argv;

const CONFIG_PATH = path.resolve("config.toml");

async function main() {
  switch (cmd) {
    case "init":
      return init();
    case "plan":
      return plan(rest.join(" ").trim());
    case "run":
      return run(rest.join(" ").trim());
    case "audit":
      return audit();
    case "learn":
      return learn();
    default:
      console.log(`Usage:
  mis init
  mis plan <goal>
  mis run <goal>
  mis audit
  mis learn`);
  }
}

/** Scaffold config and protocol files if missing. */
function init() {
  if (!fs.existsSync("config.toml")) {
    const sample = fs.readFileSync(path.join("examples", "config.example.toml"), "utf-8");
    fs.writeFileSync("config.toml", sample);
    console.log("Created config.toml");
  } else {
    console.log("config.toml already exists");
  }
  if (!fs.existsSync("protocol/AGENTS.md")) {
    fs.mkdirSync("protocol", { recursive: true });
    fs.copyFileSync(path.join("protocol", "AGENTS.md"), path.join("protocol", "AGENTS.md"));
  }
  if (!fs.existsSync("protocol/regexes.toml")) {
    fs.copyFileSync(path.join("protocol", "regexes.toml"), path.join("protocol", "regexes.toml"));
  }
  console.log("Initialized protocol files.");
}

/** Generate a plan without executing it. */
async function plan(goal: string) {
  if (!goal) {
    console.error("Plan requires a <goal>.");
    process.exit(2);
  }
  const orch = new Orchestrator({ configPath: CONFIG_PATH });
  const p = await orch.plan(goal);
  console.log(JSON.stringify(p, null, 2));
}

/** Execute a goal using the configured approval policy. */
async function run(goal: string) {
  if (!goal) {
    console.error("Run requires a <goal>.");
    process.exit(2);
  }
  const orch = new Orchestrator({ configPath: CONFIG_PATH });
  const code = await orch.run(goal);
  process.exit(code);
}

/** Placeholder audit output. */
async function audit() {
  console.log("Telemetry: (placeholder) See .makeitso/ for local traces.");
}

/** Placeholder learning pass. */
async function learn() {
  console.log("Learning: (placeholder) Propose regex/prompt improvements on replays.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
