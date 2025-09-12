/**
 * Non-blocking wait scheduler to avoid burning LLM tokens.
 *
 * Use for app-settle waits or backoff between actions. This does not involve
 * Codex; it just delays locally then resumes via callback.
 */

export type WaitStrategy = "fixed" | "expo";

export interface WaitPlan {
  strategy: WaitStrategy;
  baseMs: number;
  maxMs: number;
  attempt: number;
}

export class Waiter {
  static compute(plan: WaitPlan): number {
    if (plan.strategy === "expo") {
      const ms = Math.min(plan.maxMs, Math.floor(plan.baseMs * Math.pow(2, Math.max(0, plan.attempt - 1))));
      return ms;
    }
    return Math.min(plan.maxMs || plan.baseMs, plan.baseMs);
  }

  static async sleep(ms: number, signal?: any): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => resolve(), ms);
      if (signal) {
        (signal as any).addEventListener?.("abort", () => {
          clearTimeout(t);
          resolve();
        });
      }
    });
  }
}

