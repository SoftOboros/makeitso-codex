import { run as runParser } from "./parser.test";
import { run as runConfig } from "./config.test";
import { run as runMonitor } from "./monitor.test";
import { run as runWaiter } from "./waiter.test";
import { run as runRedact } from "./redact.test";
import { run as runIntegration } from "./integration.test";
import { run as runMi } from "./mi.test";
import { run as runDebugRouter } from "./debugRouter.test";

async function main() {
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
