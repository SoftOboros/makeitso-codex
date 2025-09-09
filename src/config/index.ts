/**
 * Config loader for makeitso-codex.
 *
 * Reads a TOML configuration file and validates required fields.
 *
 * @throws Error when file cannot be read or parsed, or when required fields are missing.
 */

import fs from "fs";
import path from "path";
import * as TOML from "toml";

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
}

export interface WorkerCodexConfig {
  run_via: "cli" | "api";
  profile: string;
  delimiters: { start: string; end: string; json?: string; err?: string };
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
  const raw = fs.readFileSync(resolved, "utf-8"); // user-supplied path; expected valid file
  const data = TOML.parse(raw);

  // Minimal validation; expand with zod later if desired
  if (!data.project || !data.manager || !data.workers || !data.policies || !data.telemetry || !data.learning) {
    throw new Error("Invalid config: missing one of [project, manager, workers, policies, telemetry, learning]");
  }
  return data as Config;
}
