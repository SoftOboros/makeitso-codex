import { BasicMonitor } from "../src/monitor";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function run() {
  // Stall detection (use tiny timeout)
  const mon = new BasicMonitor({ stallTimeoutMs: 20, dangerousRegexes: [] });
  mon.onEvent({ type: "stdout", data: "tick", timestamp: Date.now() });
  await new Promise((r) => setTimeout(r, 30));
  // send a non-activity event to trigger stall check without refreshing lastActivity
  mon.onEvent({ type: "command", data: "noop", timestamp: Date.now() });
  assert(mon.shouldInterrupt(), "monitor should detect stall and interrupt");
  const reason = mon.reason() || "";
  assert(reason.includes("stall"), "stall reason expected");

  // Reset and danger regex
  mon.reset();
  mon.clearDanger();
  mon.addDanger(/rm\s+-rf\s+\./i);
  mon.onEvent({ type: "command", data: "rm -rf ./tmp", timestamp: Date.now() });
  assert(mon.shouldInterrupt(), "monitor should interrupt on danger regex");
}
