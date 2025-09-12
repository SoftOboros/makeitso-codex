import { DebugRouter } from "../src/debug/router";
import { DebugDriver, DebugCommand, DebugResult } from "../src/debug/types";

class FakeDriver implements DebugDriver {
  name() { return "fake"; }
  async connect() {}
  async close() {}
  async execute(cmd: DebugCommand): Promise<DebugResult> {
    if (cmd.op === "pause") return { ok: true, result: { paused: true } };
    return { ok: false, error: "unsupported" };
  }
}

function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }

export async function run() {
  const r1 = new DebugRouter();
  const out1 = await r1.tryRoute("DBG:{\"op\":\"pause\"}");
  assert(out1 === "DBG-ERR: no debug driver available", "expected error without driver");

  const r2 = new DebugRouter(new FakeDriver());
  const out2 = await r2.tryRoute("DBG:{\"op\":\"pause\"}");
  assert(!!out2 && out2.startsWith("DBG-OK:"), "expected ok response");

  const out3 = await r2.tryRoute("DBG:{not-json}");
  assert(out3 === "DBG-ERR: invalid JSON in command", "expected json error");

  const out4 = await r2.tryRoute("not a debug line");
  assert(out4 === undefined, "non-debug lines should not produce output");
}

