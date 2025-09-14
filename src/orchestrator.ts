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
import { promptYesNo, promptLine } from "./manager/util";
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
    // Apply runtime profile to simplify usability
    this.applyProfile();
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
      codexRunVia: (this.cfg.manager as any).codex_run_via || "api",
      codexModel: (this.cfg.manager as any).codex_model || "gpt-4o-mini",
    });
    ConsoleLogger.note(`Planning goal: ${goal}`);
    monitor?.onEvent({ type: "start", data: goal, timestamp: Date.now() });
    remote?.onEvent({ type: "start", data: goal, timestamp: Date.now() });
    const startTs = Date.now();
    const plan = await manager.plan(goal);
    // Optional: persist the plan JSON regardless of bootstrap
    if (process.env.MIS_WRITE_PLAN === '1') {
      try {
        if (canWrite) {
          if (!fs.existsSync('.makeitso')) fs.mkdirSync('.makeitso', { recursive: true });
          const tsPlan = Date.now();
          fs.writeFileSync(`.makeitso/plan_${tsPlan}.json`, JSON.stringify(plan, null, 2));
        }
      } catch {}
    }
    // If bootstrapping, show the plan JSON to the user before approvals
    if (process.env.MIS_BOOTSTRAP) {
      try { ConsoleLogger.monitor(`Bootstrap plan:\n${JSON.stringify(plan, null, 2)}`); } catch {}
    }
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
    ConsoleLogger.debug(`orchestrator: mode=${mode} forceStub=${forceStub ? "1" : "0"}`);
    const controller = new (global as any).AbortController();
    const signal = (controller as any).signal;
    // Attach Ctrl-C/SIGTERM handlers only for the execution window
    let sigCount = 0;
    const onSignal = (_sig: any) => {
      sigCount++;
      if (sigCount === 1) {
        ConsoleLogger.monitor("Interrupt received — attempting graceful shutdown (press Ctrl-C again to force)");
        try { (controller as any).abort(); } catch {}
      } else {
        ConsoleLogger.monitor("Force exiting now");
        try { process.exit(130); } catch {}
      }
    };
    try { process.on("SIGINT", onSignal); } catch {}
    try { process.on("SIGTERM", onSignal); } catch {}
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

    // Proactive stall watchdog: poll monitor even when no output arrives
    // Disabled when a Node inspector is attached (to avoid hitting breakpoints in a tight loop)
    let stallTicker: NodeJS.Timeout | undefined;
    // Detect inspector across common scenarios: --inspect flags, VS Code bootloader, or programmatic attach
    let inspectorActive = false;
    try {
      // Node core inspector API: returns a URL string when active
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ins = require("inspector");
      inspectorActive = !!ins?.url?.();
    } catch {}
    if (!inspectorActive) {
      inspectorActive = Array.isArray(process.execArgv) && process.execArgv.some((a) => a.startsWith("--inspect"));
    }
    if (!inspectorActive) {
      const no = process.env.NODE_OPTIONS || "";
      inspectorActive = !!process.env.VSCODE_INSPECTOR_OPTIONS || /ms-vscode\.js-debug/.test(no);
    }
    const allowStallTick = !!monitor && process.env.MIS_NO_STALL_TICK !== "1" && !inspectorActive;
    if (!monitor) {
      // no monitor → nothing to do
    } else if (!allowStallTick) {
      ConsoleLogger.debug("stall watchdog disabled (inspector active or MIS_NO_STALL_TICK=1)");
    } else {
      stallTicker = setInterval(() => {
        try {
          monitor.onEvent({ type: "command", data: "tick", timestamp: Date.now() });
          if (monitor.shouldInterrupt()) {
            ConsoleLogger.monitor(`Interrupt requested: ${monitor.reason()}`);
            telemetry.record({ type: "interrupt", ts: Date.now(), data: { source: "monitor", reason: monitor.reason() } });
            try { (controller as any).abort(); } catch {}
          }
        } catch {}
      }, 1000);
    }

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
    // Optional debug trap: enable with MIS_DEBUG_TRAP=1 to break here under inspector
    if (process.env.MIS_DEBUG_TRAP === "1") {
      // eslint-disable-next-line no-debugger
      debugger;
    }
    if (!forceStub && mode === "cli" && (await enforcer.allowRunShell("invoke Codex CLI"))) {
      try {
        // Pass goal as positional prompt; optionally include extra args from config
        const extra = (this.cfg.workers.codex.extra_args || []).slice();
        try {
          if (process.env.MIS_CHILD_ARGS) {
            const injected = JSON.parse(process.env.MIS_CHILD_ARGS);
            if (Array.isArray(injected)) extra.unshift(...injected);
          }
        } catch {}
        const args = [...extra, goal];
        ConsoleLogger.debug("orchestrator: invoking runCodexCLI");
        res = await runCodexCLI(args, delims, {
          onStdout: (c) => { ConsoleLogger.codexStdout(c); checkInterrupt(c, false); },
          onStderr: (c) => { ConsoleLogger.codexStderr(c); checkInterrupt(c, true); },
        }, signal, { interactive: !!this.cfg.workers.codex.interactive, plain: !!this.cfg.workers.codex.plain, timeoutMs: this.cfg.workers.codex.timeout_ms, stdinOnly: !!this.cfg.workers.codex.stdin_only, autoInteractiveOnDSR: true });
        if (res.code === 98) {
          ConsoleLogger.monitor("Auto-fallback: respawning child in interactive mode due to terminal probe.");
          telemetry.record({ type: "note", ts: Date.now(), data: { kind: "auto_fallback", reason: "dsr_detected" } });
          res = await runCodexCLI(args, delims, {
            onStdout: (c) => { ConsoleLogger.codexStdout(c); checkInterrupt(c, false); },
            onStderr: (c) => { ConsoleLogger.codexStderr(c); checkInterrupt(c, true); },
          }, signal, { interactive: true, plain: !!this.cfg.workers.codex.plain, timeoutMs: this.cfg.workers.codex.timeout_ms, stdinOnly: false, autoInteractiveOnDSR: false });
          ConsoleLogger.debug(`orchestrator: interactive fallback returned code=${res.code}`);
        }
        ConsoleLogger.debug(`orchestrator: runCodexCLI returned code=${res.code}`);
      } catch (_e) {
        ConsoleLogger.note("CLI spawn failed; falling back to stub");
        res = await runCodexStubStreaming(goal, delims, {
          onStdout: (c) => { ConsoleLogger.codexStdout(c); checkInterrupt(c, false); },
          onStderr: (c) => { ConsoleLogger.codexStderr(c); checkInterrupt(c, true); },
        }, signal);
      }
    } else if (!forceStub && mode === "api" && (await enforcer.allowNetwork("Codex API call"))) {
      ConsoleLogger.debug("orchestrator: invoking runCodexAPI");
      const ep = this.cfg.workers.codex.api_endpoint;
      const key = this.cfg.workers.codex.api_key_env ? process.env[this.cfg.workers.codex.api_key_env] : undefined;
      const model = this.cfg.workers.codex.model;
      res = await runCodexAPI(goal, delims, { endpoint: ep, apiKey: key, model }, {
        onStdout: (c) => { ConsoleLogger.codexStdout(c); checkInterrupt(c, false); },
        onStderr: (c) => { ConsoleLogger.codexStderr(c); checkInterrupt(c, true); },
      }, signal);
      ConsoleLogger.debug(`orchestrator: runCodexAPI returned code=${res.code}`);
    } else {
      ConsoleLogger.debug("orchestrator: invoking runCodexStubStreaming");
      res = await runCodexStubStreaming(goal, delims, {
        onStdout: (c) => { ConsoleLogger.codexStdout(c); checkInterrupt(c, false); },
        onStderr: (c) => { ConsoleLogger.codexStderr(c); checkInterrupt(c, true); },
      }, signal);
      ConsoleLogger.debug(`orchestrator: runCodexStubStreaming returned code=${res.code}`);
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

    // Manager review: decide whether the goal appears complete or needs another round
    try {
      const decision = await (manager as any).review?.({ goal, stdout: res.stdout, stderr: res.stderr, artifacts: { json: parsed.json, blocks: parsed.blocks || [] } });
      if (decision) {
        const msg = `Manager decision: ${decision.status}${decision.reason ? ` — ${decision.reason}` : ''}`;
        ConsoleLogger.monitor(msg);
        telemetry.record({ type: "manager_decision", ts: Date.now(), data: decision });
        // Persist a session snapshot for continuity across rounds
        try {
          const sessionDir = ".makeitso/sessions";
          if (canWrite) {
            if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
            const snapshot = {
              ts,
              goal,
              decision,
              artifacts: parsed.json.slice(0, 8),
              stdoutBytes,
              stderrBytes,
            };
            fs.writeFileSync(`${sessionDir}/session_${ts}.json`, JSON.stringify(snapshot, null, 2));
          }
        } catch {}
        // Track simple progress heuristic across rounds
        (this as any)._iterCount = ((this as any)._iterCount ?? 0) + 1;
        const maxIter = Number((this.cfg.manager as any).max_iterations || 1);
        const maxNoProg = Number((this.cfg.manager as any).max_no_progress || 2);
        const sig = JSON.stringify(parsed.json || []).slice(0, 512);
        const prevSig = (this as any)._prevSig as string | undefined;
        if (prevSig && prevSig === sig) {
          (this as any)._noProg = ((this as any)._noProg ?? 0) + 1;
        } else {
          (this as any)._noProg = 0;
        }
        (this as any)._prevSig = sig;

        // Handle decisions
        if (decision.status === "abort") return 2;
        if (decision.status === "stuck") {
          const cont = await promptYesNo("Manager reports 'stuck'. Continue anyway?", true);
          if (!cont) return 2;
        }
        if (decision.status === "need_input") {
          const extra = await promptLine("Manager requests input. Provide additional instructions:");
          if (!extra) return 2;
          const nextGoal = `${goal}\n\nUser input: ${extra}`;
          return await this.run(nextGoal);
        }
        if (decision.status === "continue") {
          // Guardrails: hard iteration cap (0 means unlimited), and no-progress cap
          const iter = (this as any)._iterCount as number;
          const noProg = (this as any)._noProg as number;
          if (maxIter > 0 && iter >= maxIter) {
            const ok = await promptYesNo(`Reached max iterations (${maxIter}). Continue anyway?`, true);
            if (!ok) return res.code;
            (this as any)._iterCount = 0; // reset after manual allowance
          }
          if (noProg >= maxNoProg) {
            const ok = await promptYesNo(`No progress detected for ${noProg} rounds. Continue anyway?`, true);
            if (!ok) return res.code;
            (this as any)._noProg = 0;
          }
          const nextGoal = decision.nextGoal || (decision.instructions ? `${goal}\n\nFollow-up: ${decision.instructions}` : goal);
          return await this.run(nextGoal);
        }
      }
    } catch {}

    // Optional: approvals for verify/summarize
    for (const phase of task.phases) {
      if (phase.name === "verify" || phase.name === "summarize") {
        ConsoleLogger.note(`Awaiting approval for phase '${phase.name}'`);
        const _ = await manager.approve(plan, task, phase.name);
        ConsoleLogger.note(`Approved phase '${phase.name}'`);
      }
    }

    if (stallTicker) { try { clearInterval(stallTicker); } catch {} }
    // Detach signal handlers
    try { process.off("SIGINT", onSignal); } catch {}
    try { process.off("SIGTERM", onSignal); } catch {}
    const endTs = Date.now();
    monitor?.onEvent({ type: "end", data: String(res.code), timestamp: endTs });
    remote?.onEvent({ type: "end", data: String(res.code), timestamp: endTs });
    const interrupted = !!(monitor?.shouldInterrupt() || remote?.shouldInterrupt());
    telemetry.record({ type: "run_end", ts: endTs, data: { code: interrupted ? 2 : res.code, durationMs: endTs - startTs, stdoutBytes, stderrBytes } });
    // Manager/API usage report (tokens)
    try {
      const usageFn = (manager as any).usage as (undefined | (() => Promise<{ prompt?: number; completion?: number; total?: number; model?: string } >));
      if (usageFn) {
        const u = await usageFn.call(manager);
        if (u && (u.total || u.prompt || u.completion)) {
          const parts = [
            u.model ? `model=${u.model}` : undefined,
            typeof u.total === 'number' ? `total=${u.total}` : undefined,
            typeof u.prompt === 'number' ? `prompt=${u.prompt}` : undefined,
            typeof u.completion === 'number' ? `completion=${u.completion}` : undefined,
          ].filter(Boolean).join(' ');
          ConsoleLogger.monitor(`Manager token usage: ${parts}`);
          telemetry.record({ type: "manager_usage", ts: Date.now(), data: u });
        }
      }
    } catch {}
    if (interrupted) return 2;
    // Reset loop counters at natural end
    try { (this as any)._iterCount = undefined; (this as any)._noProg = undefined; (this as any)._prevSig = undefined; } catch {}
    return res.code;
  }

  /** Apply a runtime profile (dev|debug|ci) to config and environment. */
  private applyProfile() {
    // Select profile: explicit env or config, else auto
    const cfgProfile = (this.cfg.ui?.profile as any) as string | undefined;
    let profile = (process.env.MIS_PROFILE || cfgProfile || "").toLowerCase();
    if (!profile) {
      // Auto-detect: CI → ci; inspector/verbose → debug; else dev
      const isCI = process.env.CI === "1" || /true/i.test(process.env.CI || "");
      let inspector = false;
      try { const ins = require("inspector"); inspector = !!ins?.url?.(); } catch {}
      if (!inspector && Array.isArray(process.execArgv)) inspector = process.execArgv.some((a) => a.startsWith("--inspect"));
      if (!inspector && process.env.VSCODE_INSPECTOR_OPTIONS) inspector = true;
      profile = isCI ? "ci" : ((inspector || process.env.MIS_VERBOSE === "1") ? "debug" : "dev");
    }
    // Normalize and apply
    const w = this.cfg.workers.codex as any;
    // Full-auto convenience: favor CI defaults and remove iteration friction (bounded)
    const fullAuto = process.env.MIS_FULL_AUTO === "1";
    if (fullAuto) {
      // Force CI-like behavior for safety
      profile = "ci";
      // Ensure iteration has a reasonable upper bound if unset (guardrail)
      const mgr: any = this.cfg.manager as any;
      if (!mgr.max_iterations || mgr.max_iterations < 1) mgr.max_iterations = 10;
      if (!mgr.max_no_progress || mgr.max_no_progress < 1) mgr.max_no_progress = 2;
      ConsoleLogger.monitor("Full auto self-driving mode: CI profile + auto-approve + bounded iterations (10)");
    }
    if (profile === "dev") {
      w.stdin_only = w.stdin_only !== false; // default true
      w.interactive = !!w.interactive && false; // prefer capture
      w.plain = true;
      w.timeout_ms = w.timeout_ms || 15000;
      ConsoleLogger.setVerbose(process.env.MIS_VERBOSE === "1");
      ConsoleLogger.monitor(`Profile: dev (stdin_only=${w.stdin_only ? 'on' : 'off'}, plain=on)`);
    } else if (profile === "debug") {
      w.stdin_only = true;
      w.interactive = false;
      w.plain = true;
      w.timeout_ms = w.timeout_ms || 15000;
      ConsoleLogger.setVerbose(true);
      ConsoleLogger.monitor("Profile: debug (verbose, stdin_only=on, plain=on)");
    } else {
      // ci
      w.stdin_only = false;
      w.interactive = false;
      w.plain = true;
      w.timeout_ms = w.timeout_ms || 60000;
      ConsoleLogger.setVerbose(false);
      ConsoleLogger.monitor("Profile: ci (non-interactive, plain=on)");
    }
    // Expose selected profile for downstream tools
    process.env.MIS_PROFILE = profile;
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
