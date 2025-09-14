import readline from "readline";
import { setPromptActive } from "../console/logger";

export function isAutoApprove(): boolean {
  return process.env.MIS_AUTO_APPROVE === "1";
}

export function isAutoDeny(): boolean {
  return process.env.MIS_AUTO_DENY === "1";
}

export async function promptYesNo(question: string, defNo = true): Promise<boolean> {
  // Use stderr for question output to reduce contention with stdout logs
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const suffix = defNo ? " (y/N) " : " (Y/n) ";
  const q = question.endsWith(" ") ? question.trimEnd() : question;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      try { rl.close(); } catch {}
      try { setPromptActive(false); } catch {}
    };
    const onProcSigint = () => {
      cleanup();
      resolve(false);
    };
    try { process.once('SIGINT', onProcSigint); } catch {}
    try {
      // readline emits 'SIGINT' on the interface as well in some terminals
      (rl as any).once?.('SIGINT', onProcSigint);
    } catch {}
    try { setPromptActive(true); } catch {}
    rl.question(q + suffix, (answer: string) => {
      if (settled) return;
      settled = true;
      try { rl.close(); } catch {}
      try { process.off('SIGINT', onProcSigint); } catch {}
      try { setPromptActive(false); } catch {}
      const a = (answer || "").trim().toLowerCase();
      if (!a) return resolve(!defNo);
      resolve(a === 'y' || a === 'yes');
    });
  });
}

/** Prompt for a freeform line of input (on stderr to avoid stdout interleaving). */
export async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return await new Promise<string>((resolve) => {
    let settled = false;
    const cleanup = () => { if (!settled) { settled = true; try { rl.close(); } catch {} } };
    const onProcSigint = () => { cleanup(); resolve(""); };
    try { process.once('SIGINT', onProcSigint); } catch {}
    (rl as any).question(question.endsWith(' ') ? question : question + ' ', (answer: string) => {
      cleanup();
      try { process.off('SIGINT', onProcSigint); } catch {}
      resolve((answer || '').trim());
    });
  });
}
