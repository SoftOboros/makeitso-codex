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
  clearEol: "\u001b[K",
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

let VERBOSE = process.env.MIS_VERBOSE === "1";
let UI_INPLACE = process.env.MIS_UI_INPLACE === "1";
let PROMPT_ACTIVE = false;
const LOG_STRIP_ANSI = process.env.MIS_LOG_STRIP_ANSI === "1";
const LOG_DROP_BLANK = process.env.MIS_LOG_DROP_BLANK === "1";
const LOG_MAX_LINE_LEN = Math.max(0, Number(process.env.MIS_LOG_MAX_LINE_LEN || 0));

function stripAnsi(text: string): string {
  // CSI sequences: ESC [ ... cmd
  // eslint-disable-next-line no-control-regex, no-useless-escape
  const CSI = /\u001b\[[0-?]*[ -\/]*[@-~]/g;
  // OSC sequences: ESC ] ... BEL or ST
  // eslint-disable-next-line no-control-regex
  const OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
  // Other escapes (save/restore cursor, etc.) are relatively harmless to leave
  return text.replace(CSI, "").replace(OSC, "");
}

function sanitizeLine(line: string): string {
  let s = LOG_STRIP_ANSI ? stripAnsi(line) : line;
  if (LOG_MAX_LINE_LEN > 0 && s.length > LOG_MAX_LINE_LEN) {
    s = s.slice(0, LOG_MAX_LINE_LEN) + " …";
  }
  return s;
}

function shouldDropLine(line: string): boolean {
  if (!LOG_DROP_BLANK) return false;
  // Drop if empty or whitespace only after stripping ANSI
  const s = LOG_STRIP_ANSI ? stripAnsi(line) : line;
  return s.trim().length === 0;
}

export function setPromptActive(active: boolean) {
  PROMPT_ACTIVE = !!active;
}

export function setInplaceMode(enabled: boolean) {
  UI_INPLACE = !!enabled;
}

export const ConsoleLogger = {
  /** Enable/disable verbose debug logs at runtime. */
  setVerbose(v: boolean) { VERBOSE = !!v; },
  isVerbose(): boolean { return VERBOSE; },
  // Helper: does a chunk end with a newline (LF or CR)?
  // Supports both string and Buffer inputs.
  _endsWithNewline(chunk: string | Buffer): boolean {
    if (typeof chunk === "string") {
      return chunk.endsWith("\n") || chunk.endsWith("\r");
    }
    if (Buffer.isBuffer(chunk) && chunk.length > 0) {
      const last = chunk[chunk.length - 1];
      return last === 0x0a /* \n */ || last === 0x0d /* \r */;
    }
    return false;
  },
  codexStdout(chunk: string | Buffer) {
    const pre = prefix("codex", ANSI.fg.gray);
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (UI_INPLACE && !PROMPT_ACTIVE) {
      // Handle CR in-place updates: CRLF -> LF, lone CR → redraw current line without newline
      const normalized = text.replace(/\r\n/g, "\n");
      let buf = "";
      for (let i = 0; i < normalized.length; i++) {
        const ch = normalized[i];
        if (ch === "\n") {
          const line = sanitizeLine(buf);
          if (!shouldDropLine(line)) process.stdout.write(pre + line + "\n");
          buf = "";
        } else if (ch === "\r") {
          const line = sanitizeLine(buf);
          process.stdout.write("\r" + pre + line + ANSI.clearEol);
          buf = "";
        } else {
          buf += ch;
        }
      }
      if (buf.length > 0) {
        const line = sanitizeLine(buf);
        if (!shouldDropLine(line)) process.stdout.write(pre + line + "\n");
      }
      return;
    }
    // Default: normalize CR to LF and print line-wise
    if (/^\r+$/.test(text)) return; // skip pure CR heartbeats
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = sanitizeLine(lines[i]);
      const isLast = i === lines.length - 1;
      const hadTerminator = /\r|\n$/.test(text);
      if (isLast && !hadTerminator && line.length === 0) continue;
      if (shouldDropLine(line)) continue;
      const lead = PROMPT_ACTIVE ? "\n" : "";
      process.stdout.write(lead + pre + line + "\n");
    }
  },

  codexStderr(chunk: string | Buffer) {
    const pre = prefix("codex!", ANSI.fg.red);
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (UI_INPLACE && !PROMPT_ACTIVE) {
      const normalized = text.replace(/\r\n/g, "\n");
      let buf = "";
      for (let i = 0; i < normalized.length; i++) {
        const ch = normalized[i];
        if (ch === "\n") {
          const line = sanitizeLine(buf);
          if (!shouldDropLine(line)) process.stderr.write(pre + line + "\n");
          buf = "";
        } else if (ch === "\r") {
          const line = sanitizeLine(buf);
          process.stderr.write("\r" + pre + line + ANSI.clearEol);
          buf = "";
        } else {
          buf += ch;
        }
      }
      if (buf.length > 0) {
        const line = sanitizeLine(buf);
        if (!shouldDropLine(line)) process.stderr.write(pre + line + "\n");
      }
      return;
    }
    if (/^\r+$/.test(text)) return;
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = sanitizeLine(lines[i]);
      const isLast = i === lines.length - 1;
      const hadTerminator = /\r|\n$/.test(text);
      if (isLast && !hadTerminator && line.length === 0) continue;
      if (shouldDropLine(line)) continue;
      const lead = PROMPT_ACTIVE ? "\n" : "";
      process.stderr.write(lead + pre + line + "\n");
    }
  },

  note(message: string) {
    const pre = prefix("manager", ANSI.fg.cyan);
    const red = getGlobalRedactor();
    const safe = red ? red.redact(message) : message;
    const body = `${ANSI.fg.cyan}${safe}${ANSI.reset}`;
    if (UI_INPLACE && !PROMPT_ACTIVE) {
      const normalized = body.replace(/\r\n/g, "\n");
      let buf = "";
      for (let i = 0; i < normalized.length; i++) {
        const ch = normalized[i];
        if (ch === "\n") {
          process.stdout.write(pre + buf + "\n");
          buf = "";
        } else if (ch === "\r") {
          process.stdout.write("\r" + pre + buf + ANSI.clearEol);
          buf = "";
        } else {
          buf += ch;
        }
      }
      if (buf.length > 0) process.stdout.write(pre + buf + "\n");
    } else {
      const lead = PROMPT_ACTIVE ? "\n" : "";
      process.stdout.write(lead + pre + body + "\n");
    }
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
    if (UI_INPLACE && !PROMPT_ACTIVE) {
      const normalized = body.replace(/\r\n/g, "\n");
      let buf = "";
      for (let i = 0; i < normalized.length; i++) {
        const ch = normalized[i];
        if (ch === "\n") {
          process.stdout.write(pre + buf + "\n");
          buf = "";
        } else if (ch === "\r") {
          process.stdout.write("\r" + pre + buf + ANSI.clearEol);
          buf = "";
        } else {
          buf += ch;
        }
      }
      if (buf.length > 0) process.stdout.write(pre + buf + "\n");
    } else {
      const lead = PROMPT_ACTIVE ? "\n" : "";
      process.stdout.write(lead + pre + body + "\n");
    }
  },

  /** Debug-level message (prints only when MIS_VERBOSE=1). */
  debug(message: string) {
    if (!VERBOSE) return;
    const pre = prefix("debug", ANSI.fg.gray);
    try {
      const red = getGlobalRedactor();
      const safe = red ? red.redact(message) : message;
      process.stdout.write(pre + safe + "\n");
    } catch {
      process.stdout.write(pre + message + "\n");
    }
  },
};

export type StreamCallbacks = {
  onStdout?: (chunk: string | Buffer) => void;
  onStderr?: (chunk: string | Buffer) => void;
};
