/**
 * Manager abstraction: either Codex-as-Manager or an API model.
 */

import { Plan, ApprovalPolicy, ManagerKind, Task } from "../types";

export interface ManagerContext {
  approval: ApprovalPolicy;
  budgetTokens: number;
  /** Optional API key (e.g., for api:* manager kinds). */
  apiKey?: string;
  /** Optional organization/workspace identifier for API providers. */
  org?: string;
  /** Codex-as-Manager: run planning via 'api' (default) or 'cli'. */
  codexRunVia?: "api" | "cli";
  /** Codex-as-Manager model for API planning. */
  codexModel?: string;
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

  /**
   * Optional usage summary for API-based managers.
   * Implementations may return token counts (prompt/completion/total) and model info.
   */
  usage?(): Promise<{ prompt?: number; completion?: number; total?: number; model?: string }>;

  /**
   * Review worker output and decide next step.
   * Returns a decision indicating whether the goal appears complete, needs another round,
   * or should abort; may include refined instructions for the next round.
   */
  review(input: ReviewInput): Promise<ManagerDecision>;
}

/** Minimal structure passed to Manager.review. */
export interface ReviewInput {
  goal: string;
  stdout: string;
  stderr: string;
  artifacts: { json: string[]; blocks?: string[] };
}

export interface ManagerDecision {
  status: "done" | "continue" | "abort" | "need_input" | "stuck";
  reason?: string;
  nextGoal?: string;         // optional refined or follow-up goal
  instructions?: string;     // concrete guidance for the next round
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
