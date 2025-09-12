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
  signal?: any
): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";

    proc.stdout.on("data", (chunk) => {
      out += chunk.toString("utf-8");
      cb.onStdout?.(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      err += chunk.toString("utf-8");
      cb.onStderr?.(chunk);
    });

    if (signal) {
      if ((signal as any).aborted) {
        try { proc.kill("SIGTERM"); } catch {}
      }
      (signal as any).addEventListener?.("abort", () => {
        try { proc.kill("SIGTERM"); } catch {}
      });
    }

    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => {
      // Soft policy check: ensure delimiters appear at least once when expected.
      // Do not throw; leave enforcement to higher layers and parsers.
      if (!out.includes(delimiters.start) || !out.includes(delimiters.end)) {
        // no-op: could log or tag in future
      }
      resolve({ code: code ?? -1, stdout: out, stderr: err });
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
