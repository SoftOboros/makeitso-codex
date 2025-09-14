import { run as runParser } from "./parser.test";
import { run as runConfig } from "./config.test";
import { run as runMonitor } from "./monitor.test";
import { run as runWaiter } from "./waiter.test";
import { run as runRedact } from "./redact.test";
import { run as runIntegration } from "./integration.test";
import { run as runMi } from "./mi.test";
import { run as runDebugRouter } from "./debugRouter.test";

async function main() {
  // Ensure a fully non-interactive, deterministic environment for CI
  process.env.MIS_NO_STALL_TICK = process.env.MIS_NO_STALL_TICK || "1";
  process.env.MIS_DISABLE_MANAGER_API = process.env.MIS_DISABLE_MANAGER_API || "1";
  process.env.MIS_CHILD_PLAIN = process.env.MIS_CHILD_PLAIN || "1";
  process.env.MIS_PROFILE = process.env.MIS_PROFILE || "ci";
  process.env.MIS_LOG_STRIP_ANSI = process.env.MIS_LOG_STRIP_ANSI || "1";
  let failures = 0;
  const cases: Array<[string, () => void | Promise<void>]> = [
    ["parser", runParser],
    ["config", runConfig],
    ["monitor", runMonitor],
    ["waiter", runWaiter],
    ["redact", runRedact],
    ["debugRouter", runDebugRouter],
    ["mi", runMi],
    ["integration", runIntegration],
  ];
  for (const [name, fn] of cases) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (e: any) {
      failures++;
      console.error(`not ok - ${name}: ${e?.message || e}`);
    }
  }
  if (failures > 0) process.exit(1);
}

main();
