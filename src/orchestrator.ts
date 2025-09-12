/*
 SPDX-License-Identifier: MIT
 File: src/orchestrator.ts
 Description: Auto-generated header for documentation and compliance.
*/
/**
 * Orchestrator: ties together Manager planning and Worker execution.
 */

import { loadConfig, Config, MonitorConfig } from "./config";
import { createManager } from "./manager";
import { Plan, ManagerKind, Delimiters } from "./types";
import { runCodexCLI, runCodexStubStreaming, runCodexAPI } from "./worker/codexWorker";
import { parseWithPatterns } from "./parser";
import { Pattern, loadPatternLibrary } from "./parser/regexEngine";
import fs from "fs";
import { ConsoleLogger } from "./console/logger";
import { BasicMonitor } from "./monitor";
import { RemoteMonitor } from "./monitor/remote";
import { Waiter } from "./scheduler/waiter";
import { Telemetry } from "./telemetry";
import { Redactor, setGlobalRedactor } from "./secrets/redact";
import { PolicyEnforcer } from "./policy/enforcer";
// debug drivers imported dynamically during runtime when enabled

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
    const monitorCfg: MonitorConfig | undefined = this.cfg.monitor;
    const useMonitor = !!monitorCfg?.enabled;
    const monitor = useMonitor ? new BasicMonitor({
      stallTimeoutMs: monitorCfg!.stall_timeout_ms,
      dangerousRegexes: (monitorCfg!.dangerous_regexes || []).map((s) => new RegExp(s, "i")),
    }) : undefined;
    // Sandbox policy enforcer
    const enforcer = new PolicyEnforcer(this.cfg.policies);
    const canWrite = await enforcer.allowWriteFiles("save replays/artifacts/telemetry");
    // Secrets & redaction
    const red = new Redactor();
    const codexKeyEnv = this.cfg.workers.codex.api_key_env;
    const remoteKeyEnv = this.cfg.remote_monitor?.api_key_env;
    if (codexKeyEnv && process.env[codexKeyEnv]) red.addSecret(process.env[codexKeyEnv]);
    if (remoteKeyEnv && process.env[remoteKeyEnv]) red.addSecret(process.env[remoteKeyEnv]);
    setGlobalRedactor(red);
    // Telemetry
    const telemetry = new Telemetry({ enabled: !!this.cfg.telemetry?.enabled, store: canWrite ? (this.cfg.telemetry?.store || "local") : "none", redact: this.cfg.telemetry?.redact });
    telemetry.record({ type: "run_start", ts: Date.now(), data: { goal } });
    // Debug driver/router setup
    let debugRouter: any | undefined;
    if ((this as any).cfg.debug?.enabled) {
      const { DebugRouter, setGlobalDebugRouter } = require('./debug/router');
      const { NodeInspectorDriver } = require('./debug/nodeInspector');
      const { DgdbDriver } = require('./debug/dgdb');
      debugRouter = new DebugRouter();
      setGlobalDebugRouter(debugRouter);
      const allowed = await enforcer.allowNetwork("debug inspector");
      if (allowed) {
        const envUrl = process.env.MIS_INSPECT_URL;
        const cfgUrl = (this as any).cfg.debug?.inspector_url || "ws://127.0.0.1:9229";
        const url = envUrl || cfgUrl;
        const driverKind = (process.env.MIS_DEBUG_DRIVER || (this as any).cfg.debug?.driver || 'node-inspector');
        try {
          const driver = driverKind == 'dgdb' ? new DgdbDriver(url) : new NodeInspectorDriver(url);
          await driver.connect();
          debugRouter.setDriver(driver);
          ConsoleLogger.monitor(`Debug driver (${driverKind}) connected at ${url}`);
        } catch (e) {
          const msg = (e && (e as any).message) ? (e as any).message : String(e);
          ConsoleLogger.monitor(`Debug driver error: ${msg}`);
        }
      } else {
        ConsoleLogger.monitor("Debug connection not permitted by policy");
      }
    }
    // Optional remote monitor
    const rmCfg = this.cfg.remote_monitor;
    // Respect network policy for remote monitor
    const remoteAllowed = rmCfg?.enabled && rmCfg.server_url && (await enforcer.allowNetwork("remote monitor websocket"));
    const remote = remoteAllowed
      ? new RemoteMonitor({ serverUrl: rmCfg.server_url, apiKey: rmCfg.api_key_env ? process.env[rmCfg.api_key_env] : undefined, signHmac: !!rmCfg.sign_hmac })
      : undefined;
    if (remote) {
      remote.onCommand((cmd) => {
        if (cmd.type === "set" && cmd.field === "stall_timeout_ms" && typeof cmd.value === "number") {
          monitor?.setStallTimeout(cmd.value);
          ConsoleLogger.monitor(`Set stall timeout to ${cmd.value}ms`);
        } else if (cmd.type === "danger") {
          if (cmd.action === "clear") {
            monitor?.clearDanger();
            ConsoleLogger.monitor("Cleared danger patterns");
          } else if (cmd.action === "add" && cmd.pattern) {
            try {
              const rx = new RegExp(String(cmd.pattern), "i");
              monitor?.addDanger(rx);
              ConsoleLogger.monitor(`Added danger pattern: ${cmd.pattern}`);
            } catch {
              ConsoleLogger.monitor(`Invalid danger pattern: ${cmd.pattern}`);
            }
          }
        }
      });
      await remote.connect();
    }

    // Plan and approvals via Manager
    const managerKind: ManagerKind = this.cfg.manager.kind === "codex"
      ? { kind: "codex" }
      : { kind: "api", model: this.cfg.manager.kind.replace(/^api:/, "") };
    const manager = await createManager(managerKind, {
      approval: this.cfg.manager.approval,
      budgetTokens: this.cfg.manager.budget_tokens,
      apiKey: (this.cfg.manager as any).api_key_env ? process.env[(this.cfg.manager as any).api_key_env] : undefined,
      org: (this.cfg.manager as any).org_env ? process.env[(this.cfg.manager as any).org_env] : undefined,
    });
    ConsoleLogger.note(`Planning goal: ${goal}`);
    monitor?.onEvent({ type: "start", data: goal, timestamp: Date.now() });
    remote?.onEvent({ type: "start", data: goal, timestamp: Date.now() });
    const startTs = Date.now();
    const plan = await manager.plan(goal);
    const task = plan.tasks[0];
    for (const phase of task.phases) {
      ConsoleLogger.note(`Awaiting approval for phase '${phase.name}'`);
      const ts = Date.now();
      monitor?.onEvent({ type: "phase", data: phase.name, timestamp: ts });
      remote?.onEvent({ type: "phase", data: phase.name, timestamp: ts });
      telemetry.record({ type: "phase", ts, data: { name: phase.name, action: "await_approval" } });
      const ok = await manager.approve(plan, task, phase.name);
      if (!ok) {
        ConsoleLogger.note(`Run aborted at phase '${phase.name}'`);
        monitor?.onEvent({ type: "manager-note", data: `aborted at ${phase.name}`, timestamp: Date.now() });
        remote?.onEvent({ type: "manager-note", data: `aborted at ${phase.name}`, timestamp: Date.now() });
        telemetry.record({ type: "interrupt", ts: Date.now(), data: { source: "manager", reason: `aborted at ${phase.name}` } });
        return 1; // aborted
      }
      ConsoleLogger.note(`Approved phase '${phase.name}'`);
      telemetry.record({ type: "phase", ts: Date.now(), data: { name: phase.name, action: "approved" } });
      if (phase.name === "task") break; // proceed to execution after 'task' approval
    }

    // Try to run Codex CLI if configured; otherwise fallback to stub
    const forceStub = process.env.MIS_FORCE_STUB === "1";
    let res;
    const mode = this.cfg.workers.codex.run_via;
    telemetry.record({ type: "run_start", ts: startTs, data: { goal, mode } });
    const controller = new (global as any).AbortController();
    const signal = (controller as any).signal;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const checkInterrupt = (chunk: string | Buffer, isErr = false) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      monitor?.onEvent({ type: isErr ? "stderr" : "stdout", data: text, timestamp: Date.now() });
      remote?.onEvent({ type: isErr ? "stderr" : "stdout", data: text, timestamp: Date.now() });
      if (isErr) stderrBytes += Buffer.byteLength(text); else stdoutBytes += Buffer.byteLength(text);
      if (monitor?.shouldInterrupt()) {
        ConsoleLogger.monitor(`Interrupt requested: ${monitor.reason()}`);
        telemetry.record({ type: "interrupt", ts: Date.now(), data: { source: "monitor", reason: monitor.reason() } });
        try { (controller as any).abort(); } catch {}
      }
      if (remote?.shouldInterrupt()) {
        ConsoleLogger.monitor(`Remote interrupt: ${remote.reason()}`);
        telemetry.record({ type: "interrupt", ts: Date.now(), data: { source: "remote", reason: remote.reason() } });
        try { (controller as any).abort(); } catch {}
      }
    };

    // Optional pre-task wait (non-token burning)
    const preWait = this.cfg.wait?.pre_task_wait_ms || 0;
    if (preWait > 0) {
      ConsoleLogger.note(`Waiting ${preWait}ms before task (non-blocking)`);
      monitor?.onEvent({ type: "manager-note", data: `wait ${preWait}ms`, timestamp: Date.now() });
      remote?.onEvent({ type: "manager-note", data: `wait ${preWait}ms`, timestamp: Date.now() });
      telemetry.record({ type: "wait_start", ts: Date.now(), data: { reason: "pre_task", ms: preWait } });
      await Waiter.sleep(preWait, signal);
      telemetry.record({ type: "wait_end", ts: Date.now(), data: { reason: "pre_task" } });
    }
    if (!forceStub && mode === "cli" && (await enforcer.allowRunShell("invoke Codex CLI"))) {
      try {
        // Pass goal as positional prompt; avoid unsupported flags in Codex CLI
        const args = [goal];
        res = await runCodexCLI(args, delims, {
          onStdout: (c) => { ConsoleLogger.codexStdout(c); checkInterrupt(c, false); },
          onStderr: (c) => { ConsoleLogger.codexStderr(c); checkInterrupt(c, true); },
        }, signal);
      } catch (_e) {
        ConsoleLogger.note("CLI spawn failed; falling back to stub");
        res = await runCodexStubStreaming(goal, delims, {
          onStdout: (c) => { ConsoleLogger.codexStdout(c); checkInterrupt(c, false); },
          onStderr: (c) => { ConsoleLogger.codexStderr(c); checkInterrupt(c, true); },
        }, signal);
      }
    } else if (!forceStub && mode === "api" && (await enforcer.allowNetwork("Codex API call"))) {
      const ep = this.cfg.workers.codex.api_endpoint;
      const key = this.cfg.workers.codex.api_key_env ? process.env[this.cfg.workers.codex.api_key_env] : undefined;
      const model = this.cfg.workers.codex.model;
      res = await runCodexAPI(goal, delims, { endpoint: ep, apiKey: key, model }, {
        onStdout: (c) => { ConsoleLogger.codexStdout(c); checkInterrupt(c, false); },
        onStderr: (c) => { ConsoleLogger.codexStderr(c); checkInterrupt(c, true); },
      }, signal);
    } else {
      res = await runCodexStubStreaming(goal, delims, {
        onStdout: (c) => { ConsoleLogger.codexStdout(c); checkInterrupt(c, false); },
        onStderr: (c) => { ConsoleLogger.codexStderr(c); checkInterrupt(c, true); },
      }, signal);
    }

    // Store raw logs for learning
    const ts = Date.now();
    if (canWrite) {
      if (!fs.existsSync(".makeitso/replays")) {
        fs.mkdirSync(".makeitso/replays", { recursive: true });
      }
      fs.writeFileSync(`.makeitso/replays/${ts}_stdout.log`, res.stdout);
      fs.writeFileSync(`.makeitso/replays/${ts}_stderr.log`, res.stderr);
    }

    // Parse artifacts using pattern library; fallback to default patterns if TOML unavailable
    const patterns = this.safeLoadPatterns(this.cfg.learning.regex_repo);
    const parsed = parseWithPatterns(res.stdout, patterns);

    // Save parsed JSON artifacts
    const artifactsDir = this.cfg.project.artifacts_dir || ".makeitso/artifacts";
    if (canWrite) {
      if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
      }
      parsed.json.forEach((j, i) => {
        try {
          const obj = JSON.parse(j);
          fs.writeFileSync(`${artifactsDir}/artifact_${ts}_${i}.json`, JSON.stringify(obj, null, 2));
        } catch {
          fs.writeFileSync(`${artifactsDir}/artifact_${ts}_${i}.json.txt`, j);
        }
      });
    }

    // Optional: approvals for verify/summarize
    for (const phase of task.phases) {
      if (phase.name === "verify" || phase.name === "summarize") {
        ConsoleLogger.note(`Awaiting approval for phase '${phase.name}'`);
        const _ = await manager.approve(plan, task, phase.name);
        ConsoleLogger.note(`Approved phase '${phase.name}'`);
      }
    }

    const endTs = Date.now();
    monitor?.onEvent({ type: "end", data: String(res.code), timestamp: endTs });
    remote?.onEvent({ type: "end", data: String(res.code), timestamp: endTs });
    const interrupted = !!(monitor?.shouldInterrupt() || remote?.shouldInterrupt());
    telemetry.record({ type: "run_end", ts: endTs, data: { code: interrupted ? 2 : res.code, durationMs: endTs - startTs, stdoutBytes, stderrBytes } });
    if (interrupted) return 2;
    return res.code;
  }

  /** Load pattern library with a built-in default fallback. */
  private safeLoadPatterns(tomlPath: string): Pattern[] {
    const defaults: Pattern[] = [
      { name: "json_block", intent: "extract-json", regex: "<<MIS:JSON>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
      { name: "error_block", intent: "extract-error", regex: "<<MIS:ERR>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
      { name: "start_end_block", intent: "extract-block", regex: "<<MIS:START>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
    ];
    try {
      return loadPatternLibrary(tomlPath);
    } catch {
      return defaults;
    }
  }
}
