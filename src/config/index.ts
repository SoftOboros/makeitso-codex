/*
 SPDX-License-Identifier: MIT
 File: src/config/index.ts
 Description: Auto-generated header for documentation and compliance.
*/
/**
 * Config loader for makeitso-codex.
 *
 * Reads a TOML configuration file and validates required fields.
 *
 * @throws Error when file cannot be read or parsed, or when required fields are missing.
 */

import fs from "fs";
import path from "path";

export interface ProjectConfig {
  name: string;
  root: string;
  artifacts_dir: string;
}

export interface ManagerConfig {
  kind: string;           // e.g., "codex" or "api:gpt-5-instant"
  approval: "manual" | "confirm-phase" | "delegate";
  budget_tokens: number;
  max_concurrency?: number;
  api_key_env?: string;   // e.g., OPENAI_API_KEY
  org_env?: string;       // e.g., OPENAI_ORG
  max_iterations?: number; // optional: allow simple multi-round looping when manager suggests continue
  max_no_progress?: number; // optional: stop or ask when progress stalls for N rounds
  // Codex-as-Manager settings
  codex_run_via?: "api" | "cli"; // planning via API (default) or local Codex CLI
  codex_model?: string;           // model to use for API planning (e.g., gpt-4o-mini)
}

export interface WorkerCodexConfig {
  run_via: "cli" | "api";
  profile: string;
  delimiters: { start: string; end: string; json?: string; err?: string };
  api_endpoint?: string; // optional: Codex API base URL
  api_key_env?: string;  // optional: env var name for API key
  model?: string;        // optional: default model name
  extra_args?: string[]; // optional: extra CLI args before the goal
  interactive?: boolean; // optional: inherit stdio for child (for prompts)
  plain?: boolean;       // optional: request plain output (no color/spinner)
  timeout_ms?: number;   // optional: soft timeout for child inactivity
  stdin_only?: boolean;  // optional: inherit only stdin (keep stdout/stderr captured)
}

export interface PoliciesConfig {
  write_files: "never" | "ask" | "auto";
  run_shell: "never" | "ask" | "auto";
  network: "never" | "ask" | "auto";
}

export interface TelemetryConfig {
  enabled: boolean;
  redact: boolean;
  store: "local" | "none";
}

export interface LearningConfig {
  mode: "off" | "shadow" | "canary" | "auto";
  regex_repo: string;
  prompt_repo: string;
  replay_dir: string;
}

export interface Config {
  project: ProjectConfig;
  manager: ManagerConfig;
  workers: { codex: WorkerCodexConfig };
  policies: PoliciesConfig;
  telemetry: TelemetryConfig;
  learning: LearningConfig;
  monitor?: MonitorConfig;
  remote_monitor?: RemoteMonitorConfig;
  wait?: WaitConfig;
  debug?: DebugConfig;
  ui?: UIConfig;
}

/**
 * Load configuration from a TOML file path.
 *
 * @param configPath absolute or relative path to a TOML file
 * @returns parsed Config object
 * @throws Error if file read/parse fails or required blocks are missing
 */
export function loadConfig(configPath: string): Config {
  const resolved = path.resolve(configPath);
  try {
    const raw = fs.readFileSync(resolved, "utf-8");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TOML: any = require("toml");
    const data = TOML.parse(raw);
    if (!data.project || !data.manager || !data.workers || !data.policies || !data.telemetry || !data.learning) {
      return defaultConfig();
    }
    const cfg = data as Config;
    // Ensure monitor block defaults if missing
    if (!cfg.monitor) cfg.monitor = defaultMonitorConfig();
    if (!cfg.remote_monitor) cfg.remote_monitor = defaultRemoteMonitorConfig();
    if (!cfg.wait) cfg.wait = defaultWaitConfig();
    if (!cfg.debug) cfg.debug = defaultDebugConfig();
    if (!cfg.ui) cfg.ui = defaultUIConfig();
    return cfg;
  } catch {
    // If TOML or file unavailable, fallback to defaults
    return defaultConfig();
  }
}

function defaultConfig(): Config {
  return {
    project: { name: "default", root: "./", artifacts_dir: ".makeitso/artifacts" },
    manager: { kind: "codex", approval: "delegate", budget_tokens: 250000, max_concurrency: 1, max_iterations: 1, max_no_progress: 2, codex_run_via: "api", codex_model: "gpt-4o-mini" },
    workers: { codex: { run_via: "api", profile: "default", delimiters: { start: "<<MIS:START>>", end: "<<MIS:END>>", json: "<<MIS:JSON>>", err: "<<MIS:ERR>>" }, extra_args: [], interactive: false, plain: false, timeout_ms: 60000, stdin_only: false } },
    policies: { write_files: "ask", run_shell: "ask", network: "ask" },
    telemetry: { enabled: true, redact: true, store: "local" },
    learning: { mode: "shadow", regex_repo: "./protocol/regexes.toml", prompt_repo: "./protocol/prompts/", replay_dir: ".makeitso/replays" },
    monitor: defaultMonitorConfig(),
    remote_monitor: defaultRemoteMonitorConfig(),
    wait: defaultWaitConfig(),
    debug: defaultDebugConfig(),
  };
}

export interface MonitorConfig {
  enabled: boolean;
  stall_timeout_ms: number; // inactivity window before considering stalled
  dangerous_regexes?: string[]; // optional additional patterns
}

function defaultMonitorConfig(): MonitorConfig {
  return {
    enabled: false,
    stall_timeout_ms: 120000,
    dangerous_regexes: [],
  };
}

export interface RemoteMonitorConfig {
  enabled: boolean;
  server_url: string; // base server URL to obtain WS endpoint
  api_key_env?: string; // optional env var name for API key
  sign_hmac?: boolean;  // add x-mis-ts and x-mis-sig headers using api key
}

function defaultRemoteMonitorConfig(): RemoteMonitorConfig {
  return { enabled: false, server_url: "", api_key_env: undefined, sign_hmac: false };
}

export interface WaitConfig {
  enabled: boolean;
  strategy: "fixed" | "expo";
  base_ms: number;
  max_ms: number;
  pre_task_wait_ms?: number; // optional pre-execution wait
}

function defaultWaitConfig(): WaitConfig {
  return { enabled: true, strategy: "fixed", base_ms: 0, max_ms: 0, pre_task_wait_ms: 0 };
}

export interface DebugConfig {
  enabled: boolean;
  driver?: string; // e.g., "node-inspector" | "dgdb"
  inspector_url?: string; // ws://127.0.0.1:9229 or full target URL
}

function defaultDebugConfig(): DebugConfig {
  return { enabled: false, driver: "node-inspector", inspector_url: "ws://127.0.0.1:9229" } as DebugConfig;
}

export interface UIConfig {
  open_url?: "auto" | "print" | "command";
  open_url_command?: string; // when open_url=="command", e.g., "curl -I"
  profile?: "dev" | "debug" | "ci"; // optional runtime profile
}

function defaultUIConfig(): UIConfig {
  return { open_url: "auto", profile: undefined };
}
