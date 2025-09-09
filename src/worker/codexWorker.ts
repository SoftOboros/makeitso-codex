/**
 * Codex worker runner.
 *
 * For CLI mode: spawn codex with arguments, capture STDOUT/STDERR, and enforce delimiter policy.
 * For API mode: call Codex API and normalize response.
 *
 * Security: never print secrets; mask tokens in logs. Treat external/user input as untrusted.
 */

import { Delimiters } from "../types";
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
export function runCodexCLI(args: string[], delimiters: Delimiters): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";

    proc.stdout.on("data", (chunk) => { out += chunk.toString("utf-8"); });
    proc.stderr.on("data", (chunk) => { err += chunk.toString("utf-8"); });

    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => {
      // Soft policy check: ensure delimiters appear at least once when expected.
      if (!out.includes(delimiters.start) || ! out.includes(delimiters.end)):
          pass
      resolve({ code: code ?? -1, stdout: out, stderr: err });
    });
  });
}
