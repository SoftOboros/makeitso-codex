/**
 * Orchestrator: ties together Manager planning and Worker execution.
 */

import { loadConfig, Config } from "./config";
import { createManager } from "./manager";
import { Plan, ApprovalPolicy, ManagerKind, Delimiters } from "./types";
import { runCodexCLI } from "./worker/codexWorker";
import fs from "fs";

export interface OrchestratorOptions {
  configPath: string;
}

export class Orchestrator {
  private cfg: Config;

  /**
   * Create a new Orchestrator.
   * @param options OrchestratorOptions containing path to config TOML.
   * @throws Error if config fails to load/validate.
   */
  constructor(private options: OrchestratorOptions) {
    this.cfg = loadConfig(options.configPath);
  }

  /**
   * Generate (but do not execute) a plan for a high-level goal.
   * @param goal Human goal string
   * @returns Plan object produced by the Manager
   * @throws Error if manager initialization fails
   */
  async plan(goal: string): Promise<Plan> {
    const managerKind: ManagerKind = this.cfg.manager.kind === "codex"
      ? { kind: "codex" }
      : { kind: "api", model: this.cfg.manager.kind.replace(/^api:/, "") };

    const manager = await createManager(managerKind, {
      approval: this.cfg.manager.approval,
      budgetTokens: this.cfg.manager.budget_tokens
    });

    return manager.plan(goal);
  }

  /**
   * Execute a goal with the current approval policy.
   * This stub runs a single Codex CLI command; extend to full multi-task orchestration.
   *
   * @param goal Human goal string
   * @returns exit code (0 = success)
   * @throws Error if worker fails to spawn or config invalid
   */
  async run(goal: string): Promise<number> {
    const delims = this.cfg.workers.codex.delimiters as Delimiters;

    // Example: pass the goal to codex in a hypothetical way; replace with real CLI/API
    const args = ["--goal", goal, "--emit-delimited", delims.start, delims.end];

    const res = await runCodexCLI(args, delims);

    // Store raw logs for learning
    if (!fs.existsSync(".makeitso/replays")) {
      fs.mkdirSync(".makeitso/replays", { recursive: true });
    }
    fs.writeFileSync(`.makeitso/replays/${Date.now()}_stdout.log`, res.stdout);
    fs.writeFileSync(`.makeitso/replays/${Date.now()}_stderr.log`, res.stderr);

    return res.code;
  }
}
