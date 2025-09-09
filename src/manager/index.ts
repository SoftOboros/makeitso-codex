/**
 * Manager abstraction: either Codex-as-Manager or an API model.
 */

import { Plan, ApprovalPolicy, ManagerKind, Task } from "../types";

export interface ManagerContext {
  approval: ApprovalPolicy;
  budgetTokens: number;
}

/**
 * Manager interface for planning and governance.
 */
export interface Manager {
  /**
   * Produce a plan for a high-level goal.
   * @param goal Human goal string
   * @returns Plan containing tasks and phases
   */
  plan(goal: string): Promise<Plan>;

  /**
   * Optional hook to review and approve a phase/task boundary.
   * Implementations may auto-approve depending on policy.
   *
   * @param plan The current Plan
   * @param task The task entering/leaving a phase
   * @param phaseName Phase identifier (e.g., 'bootstrap', 'task', 'verify', 'summarize')
   * @returns boolean approval
   */
  approve(plan: Plan, task: Task, phaseName: string): Promise<boolean>;
}

/**
 * Factory to create a Manager based on configuration.
 */
export async function createManager(kind: ManagerKind, ctx: ManagerContext): Promise<Manager> {
  if (kind.kind === "codex") {
    const { CodexManager } = await import("./managers/codexManager");
    return new CodexManager(ctx);
  }
  const { ApiManager } = await import("./managers/apiManager");
  return new ApiManager(kind.model, ctx);
}
