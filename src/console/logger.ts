/**
 * Console logger that mirrors Codex streams and emits manager notes.
 *
 * - Preserves Codex color codes by writing chunks unmodified.
 * - Adds minimal, dim prefixes for stream labels in a consistent log form.
 * - Provides a 'note' stream for Manager annotations.
 */

/* ANSI helpers (avoid deps) */
const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  fg: {
    red: "\u001b[31m",
    cyan: "\u001b[36m",
    magenta: "\u001b[35m",
    gray: "\u001b[90m",
  },
};

function ts(): string {
  const d = new Date();
  const iso = d.toISOString();
  return iso.substring(11, 19); // HH:MM:SS
}

function prefix(label: string, color?: string): string {
  const c = color || ANSI.fg.gray;
  return `${ANSI.dim}${c}[${ts()} ${label}]${ANSI.reset} `;
}

import { getGlobalRedactor } from "../secrets/redact";

export const ConsoleLogger = {
  codexStdout(chunk: string | Buffer) {
    const pre = prefix("codex", ANSI.fg.gray);
    // Preserve Codex coloring by not altering chunk; only prefix is dim
    process.stdout.write(pre);
    process.stdout.write(chunk);
    if (typeof chunk === "string" && !chunk.endsWith("\n")) process.stdout.write("\n");
  },

  codexStderr(chunk: string | Buffer) {
    const pre = prefix("codex!", ANSI.fg.red);
    process.stderr.write(pre);
    process.stderr.write(chunk);
    if (typeof chunk === "string" && !chunk.endsWith("\n")) process.stderr.write("\n");
  },

  note(message: string) {
    const pre = prefix("manager", ANSI.fg.cyan);
    const red = getGlobalRedactor();
    const safe = red ? red.redact(message) : message;
    const body = `${ANSI.fg.cyan}${safe}${ANSI.reset}`;
    process.stdout.write(pre + body + "\n");
    // Debug routing: pass manager-emitted debug commands to the debug router
    if (/^\s*DBG\s*:/.test(safe)) {
      try {
        // dynamic import to avoid cycles
        const { getGlobalDebugRouter } = require("../debug/router");
        const router = getGlobalDebugRouter?.();
        if (router) {
          (async () => {
            const resp = await router.tryRoute(String(safe));
            if (resp) {
              const rbody = `${ANSI.fg.cyan}${red ? red.redact(resp) : resp}${ANSI.reset}`;
              process.stdout.write(pre + rbody + "\n");
            }
          })();
        }
      } catch {}
    }
  },

  monitor(message: string) {
    const pre = prefix("monitor", ANSI.fg.magenta);
    const red = getGlobalRedactor();
    const safe = red ? red.redact(message) : message;
    const body = `${ANSI.fg.magenta}${safe}${ANSI.reset}`;
    process.stdout.write(pre + body + "\n");
  },
};

export type StreamCallbacks = {
  onStdout?: (chunk: string | Buffer) => void;
  onStderr?: (chunk: string | Buffer) => void;
};
