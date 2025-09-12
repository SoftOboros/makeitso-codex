import readline from "readline";

export function isAutoApprove(): boolean {
  return process.env.MIS_AUTO_APPROVE === "1";
}

export function isAutoDeny(): boolean {
  return process.env.MIS_AUTO_DENY === "1";
}

export async function promptYesNo(question: string, defNo = true): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defNo ? " (y/N) " : " (Y/n) ";
  const q = question.endsWith(" ") ? question.trimEnd() : question;
  const answer: string = await new Promise((resolve) => rl.question(q + suffix, resolve));
  rl.close();
  const a = (answer || "").trim().toLowerCase();
  if (!a) return !defNo;
  return a === "y" || a === "yes";
}

