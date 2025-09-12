import { Waiter } from "../src/scheduler/waiter";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function run() {
  // Fixed strategy compute
  let ms = Waiter.compute({ strategy: "fixed", baseMs: 100, maxMs: 200, attempt: 1 });
  assert(ms === 100, "fixed wait compute");

  // Expo strategy compute
  ms = Waiter.compute({ strategy: "expo", baseMs: 100, maxMs: 1000, attempt: 3 });
  assert(ms === 400, "expo wait compute attempt 3 should be 400");

  // Sleep returns after ~ given ms and supports abort
  const t0 = Date.now();
  await Waiter.sleep(20);
  const dt = Date.now() - t0;
  assert(dt >= 15, "sleep waited roughly expected time");

  // Abortable sleep
  const ctrl = new (global as any).AbortController();
  const p = Waiter.sleep(200, ctrl.signal);
  setTimeout(() => (ctrl as any).abort(), 20);
  const t1 = Date.now();
  await p;
  const dtAbort = Date.now() - t1;
  assert(dtAbort < 100, "sleep aborted early");
}

