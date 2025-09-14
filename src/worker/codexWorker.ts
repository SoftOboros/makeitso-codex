/**
 * Codex worker runner.
 *
 * For CLI mode: spawn codex with arguments, capture STDOUT/STDERR, and enforce delimiter policy.
 * For API mode: call Codex API and normalize response.
 *
 * Security: never print secrets; mask tokens in logs. Treat external/user input as untrusted.
 */

import { Delimiters } from "../types";
import { StreamCallbacks } from "../console/logger";
import { ConsoleLogger } from "../console/logger";
import { spawn } from "child_process";

export interface WorkerResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a Codex CLI process with delimited output capture.
 *
 * @param args Codex CLI args (e.g., ['--task', 'generate-tests'])
 * @param delimiters Delimiter tokens to enforce and later parse
 * @returns WorkerResult containing exit code and captured output
 * @throws Error if the process spawn fails
 */
export function runCodexCLI(
  args: string[],
  delimiters: Delimiters,
  cb: StreamCallbacks = {},
  signal?: any,
  opts?: { interactive?: boolean; plain?: boolean; timeoutMs?: number; stdinOnly?: boolean; autoInteractiveOnDSR?: boolean }
): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    // If already aborted, don't spawn; exit fast with a distinct code.
    if (signal && (signal as any).aborted) {
      ConsoleLogger.debug("runCodexCLI: signal already aborted; skipping spawn");
      return resolve({ code: 2, stdout: "", stderr: "aborted" });
    }
    // Sanitize environment to avoid inheriting global Node inspector flags that can pause the child
    const env = { ...process.env } as Record<string, string>;
    if (process.env.MIS_PASSTHROUGH_NODE_OPTIONS !== "1") {
      delete (env as any).NODE_OPTIONS;
      delete (env as any).NODE_INSPECT_RESUME_ON_START;
    }
    // Optional: make child output plain to avoid control sequences/spinners
    const envPlain = process.env.MIS_CHILD_PLAIN === "1";
    const wantPlain = envPlain ? true : (opts?.plain ?? false);
    if (wantPlain) {
      env.TERM = env.TERM || "dumb";
      env.NO_COLOR = "1";
      env.FORCE_COLOR = "0" as any;
      env.CLICOLOR = "0" as any;
      env.CI = env.CI || "1";
    }
    ConsoleLogger.debug(`runCodexCLI: spawning 'codex' with args: ${JSON.stringify(args)}`);
    const envInteractive = process.env.MIS_CHILD_INTERACTIVE === "1";
    const interactive = envInteractive ? true : (opts?.interactive ?? false);
    const envStdinOnly = process.env.MIS_CHILD_STDIN === "1";
    const inheritStdinOnly = envStdinOnly ? true : (opts?.stdinOnly ?? false);
    const stdio: any = interactive
      ? ["inherit", "inherit", "inherit"]
      : (inheritStdinOnly ? ["inherit", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]);
    const proc = spawn("codex", args, { stdio, env });
    ConsoleLogger.debug(`runCodexCLI: spawned pid=${proc.pid ?? -1}`);
    let out = "";
    let err = "";
    let settled = false;
    let onAbort: (() => void) | undefined;
    // eslint-disable-next-line prefer-const
    let cleanupSignals: (() => void) | undefined;
    // Inactivity / diagnostics
    let lastActivity = Date.now();
    const touch = () => { lastActivity = Date.now(); };
    const envTimeout = Number(process.env.MIS_CHILD_TIMEOUT_MS || 0);
    const timeoutMs = Math.max(0, (envTimeout > 0 ? envTimeout : (opts?.timeoutMs ?? 0)));
    let idleTimer: NodeJS.Timeout | undefined;
    if (timeoutMs > 0 && !interactive) {
      idleTimer = setInterval(() => {
        const idleFor = Date.now() - lastActivity;
        if (idleFor >= timeoutMs) {
          ConsoleLogger.monitor(`Child idle for ~${Math.round(idleFor/1000)}s (no printable output). It may be waiting for input; set MIS_CHILD_INTERACTIVE=1 or workers.codex.interactive=true.`);
          lastActivity = Date.now();
        }
      }, Math.min(timeoutMs, 5000));
    }
    // Detect terminal DSR (ESC[6n) to optionally trigger auto fallback to interactive mode
    const wantAutoDSR = opts?.autoInteractiveOnDSR !== false;
    let dsrTriggered = false;
    const settle = (code: number) => {
      if (settled) return;
      settled = true;
      try { if (signal && onAbort) (signal as any).removeEventListener?.("abort", onAbort); } catch {}
      try { cleanupSignals?.(); } catch {}
      try { if (idleTimer) clearInterval(idleTimer); } catch {}
      resolve({ code: code ?? -1, stdout: out, stderr: err });
    };

    if (proc.stdout) {
      proc.stdout.on("data", (chunk) => {
        out += chunk.toString("utf-8");
        cb.onStdout?.(chunk);
        if (!interactive && !inheritStdinOnly && wantAutoDSR && !dsrTriggered) {
          const s = chunk.toString("utf-8");
          // eslint-disable-next-line no-control-regex
          if (/\x1b\[6n/.test(s)) {
            dsrTriggered = true;
            ConsoleLogger.monitor("Detected terminal probe (DSR: ESC[6n) from child; switching to interactive mode for this run.");
            try { proc.kill("SIGTERM"); } catch {}
            const t = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 1500);
            proc.once("close", () => { try { clearTimeout(t); } catch {} });
            // Return a special code indicating to the caller to respawn interactively
            settle(98);
            return;
          }
        }
        if (ConsoleLogger.isVerbose()) {
          const bytes = Buffer.byteLength(chunk as any);
          const text = chunk.toString("utf-8");
          ConsoleLogger.debug(`runCodexCLI: stdout +${bytes}B (total ${out.length} chars)`);
          if (process.env.MIS_LOG_RAW === "1") {
            const hex = Buffer.from(chunk as any).toString("hex").replace(/(..)/g, "$1 ").trim();
            ConsoleLogger.debug(`runCodexCLI: stdout raw hex: ${hex}`);
            // Show a safe preview with control chars escaped
            // Show a safe preview with control chars escaped
            // eslint-disable-next-line no-control-regex
            const preview = text.replace(/[\x00-\x1f\x7f]/g, (c: string) => {
              const code = c.charCodeAt(0);
              if (code === 10) return "<LF>"; // line feed
              if (code === 13) return "<CR>"; // carriage return
              if (code === 9) return "<TAB>";
              if (code === 27) return "<ESC>";
              return `<0x${code.toString(16).padStart(2, '0').toUpperCase()}>`;
            });
            ConsoleLogger.debug(`runCodexCLI: stdout preview: ${preview}`);
          }
        }
        touch();
      });
    } else {
      ConsoleLogger.debug("runCodexCLI: stdout inherited (not captured)");
    }
    if (proc.stderr) {
      proc.stderr.on("data", (chunk) => {
        err += chunk.toString("utf-8");
        cb.onStderr?.(chunk);
        if (ConsoleLogger.isVerbose()) {
          const bytes = Buffer.byteLength(chunk as any);
          const text = chunk.toString("utf-8");
          ConsoleLogger.debug(`runCodexCLI: stderr +${bytes}B (total ${err.length} chars)`);
          if (process.env.MIS_LOG_RAW === "1") {
            const hex = Buffer.from(chunk as any).toString("hex").replace(/(..)/g, "$1 ").trim();
            ConsoleLogger.debug(`runCodexCLI: stderr raw hex: ${hex}`);
            // Show a safe preview with control chars escaped
            // eslint-disable-next-line no-control-regex
            const preview = text.replace(/[\x00-\x1f\x7f]/g, (c: string) => {
              const code = c.charCodeAt(0);
              if (code === 10) return "<LF>";
              if (code === 13) return "<CR>";
              if (code === 9) return "<TAB>";
              if (code === 27) return "<ESC>";
              return `<0x${code.toString(16).padStart(2, '0').toUpperCase()}>`;
            });
            ConsoleLogger.debug(`runCodexCLI: stderr preview: ${preview}`);
          }
        }
        touch();
      });
    } else {
      ConsoleLogger.debug("runCodexCLI: stderr inherited (not captured)");
    }

    if (signal) {
      let killTimer: NodeJS.Timeout | undefined;
      onAbort = () => {
        ConsoleLogger.debug(`runCodexCLI: abort received → SIGTERM pid=${proc.pid ?? -1}`);
        try { proc.kill("SIGTERM"); } catch {}
        // Ensure the child exits; escalate to SIGKILL if needed
        try {
          if (killTimer) { clearTimeout(killTimer); }
          killTimer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 4000);
          proc.once("close", () => { if (killTimer) clearTimeout(killTimer); });
        } catch {}
      };
      (signal as any).addEventListener?.("abort", onAbort);
    }

    // Also react to Ctrl-C/termination at the worker level in case higher-level handlers aren't active yet
    const onSig = () => {
      ConsoleLogger.debug(`runCodexCLI: SIGINT/SIGTERM → terminating child pid=${proc.pid ?? -1}`);
      try { proc.kill("SIGTERM"); } catch {}
      // Give the child a brief moment; then force exit path
      const t = setTimeout(() => settle(130), 1500);
      proc.once("close", () => { try { clearTimeout(t); } catch {} settle(130); });
    };
    try { process.on("SIGINT", onSig); } catch {}
    try { process.on("SIGTERM", onSig); } catch {}
    cleanupSignals = () => {
      try { process.off("SIGINT", onSig); } catch {}
      try { process.off("SIGTERM", onSig); } catch {}
    };

    proc.on("error", (e) => { ConsoleLogger.debug(`runCodexCLI: spawn error: ${(e as any)?.message || e}`); if (!settled) reject(e); });
    proc.on("close", (code) => {
      ConsoleLogger.debug(`runCodexCLI: close event code=${code}`);
      // Soft policy check: ensure delimiters appear at least once when expected.
      // Do not throw; leave enforcement to higher layers and parsers.
      if (!out.includes(delimiters.start) || !out.includes(delimiters.end)) {
        ConsoleLogger.debug("runCodexCLI: delimiters not found in stdout");
      }
      settle(code ?? -1);
    });
  });
}

/**
 * Stubbed Codex runner: emits delimited blocks without invoking external binaries.
 */
export async function runCodexStub(goal: string, delimiters: Delimiters): Promise<WorkerResult> {
  const start = delimiters.start || "<<MIS:START>>";
  const end = delimiters.end || "<<MIS:END>>";
  const json = delimiters.json || "<<MIS:JSON>>";
  const lines: string[] = [];
  lines.push(`${start}Executing goal: ${goal}${end}`);
  const artifact = {
    goal,
    timestamp: Date.now(),
    result: "ok",
    notes: "This output is from runCodexStub",
  };
  lines.push(`${json}${JSON.stringify(artifact)}${end}`);
  const stdout = lines.join("\n");
  return { code: 0, stdout, stderr: "" };
}

/**
 * Streaming stub that simulates Codex output line-by-line via callbacks.
 */
export async function runCodexStubStreaming(
  goal: string,
  delimiters: Delimiters,
  cb: StreamCallbacks = {},
  signal?: any
): Promise<WorkerResult> {
  const start = delimiters.start || "<<MIS:START>>";
  const end = delimiters.end || "<<MIS:END>>";
  const json = delimiters.json || "<<MIS:JSON>>";
  const lines: string[] = [];
  lines.push(`${start}Executing goal: ${goal}${end}`);
  const artifact = {
    goal,
    timestamp: Date.now(),
    result: "ok",
    notes: "This output is from runCodexStubStreaming",
  };
  lines.push(`${json}${JSON.stringify(artifact)}${end}`);

  let stdout = "";
  for (const line of lines) {
    if (signal && (signal as any).aborted) break;
    const chunk = line + "\n";
    stdout += chunk;
    cb.onStdout?.(chunk);
    await new Promise((r) => setTimeout(r, 10));
  }
  return { code: 0, stdout, stderr: "" };
}

/**
 * API worker: placeholder structure that would call a Codex API and stream back
 * responses. In restricted/no-network environments, falls back to local streaming stub.
 */
export async function runCodexAPI(
  goal: string,
  delimiters: Delimiters,
  opts: { endpoint?: string; apiKey?: string; model?: string },
  cb: StreamCallbacks = {},
  signal?: any
): Promise<WorkerResult> {
  // Without network or endpoint, behave like the streaming stub
  if (!opts.endpoint || !opts.apiKey) {
    return runCodexStubStreaming(goal, delimiters, cb, signal);
  }
  // Minimal simulated behavior; replace with real HTTP streaming integration.
  const start = delimiters.start || "<<MIS:START>>";
  const end = delimiters.end || "<<MIS:END>>";
  const json = delimiters.json || "<<MIS:JSON>>";
  const artifact = {
    goal,
    model: opts.model || "default",
    timestamp: Date.now(),
    via: "api",
    result: "ok",
  };
  const parts = [
    `${start}API executing goal: ${goal}${end}`,
    `${json}${JSON.stringify(artifact)}${end}`,
  ];
  let stdout = "";
  for (const p of parts) {
    if (signal && (signal as any).aborted) break;
    const chunk = p + "\n";
    stdout += chunk;
    cb.onStdout?.(chunk);
    await new Promise((r) => setTimeout(r, 10));
  }
  return { code: 0, stdout, stderr: "" };
}
