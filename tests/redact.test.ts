import { Redactor } from "../src/secrets/redact";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function run() {
  const r = new Redactor();
  r.addSecret("sk-ABCDEF1234567890");
  const s = "token=sk-ABCDEF1234567890 more";
  const red = r.redact(s);
  assert(!red.includes("ABCDEF1234567890"), "secret not redacted");
  assert(red.includes("******"), "mask expected");
}

