/**
 * Codex-as-Manager: uses Codex itself at a higher level for planning and approvals.
 * NOTE: This is a stub. Wire to Codex CLI/API as you enable it.
 */

import { Manager, ManagerContext } from "../index";
import { Plan, Task } from "../../types";
import { isAutoApprove, isAutoDeny, promptYesNo } from "../util";
import { ConsoleLogger } from "../../console/logger";

export class CodexManager implements Manager {
  constructor(private ctx: ManagerContext) {}

  /** @inheritdoc */
  async plan(goal: string): Promise<Plan> {
    // TODO: replace with Codex prompt call
    ConsoleLogger.note(`Manager planning: allocating budget ${this.ctx.budgetTokens}`);
    return {
      id: `plan_${Date.now()}`,
      budgetTokens: this.ctx.budgetTokens,
      tasks: [{
        id: "t1",
        goal,
        phases: [
          { name: "bootstrap", approval: this.ctx.approval },
          { name: "task", approval: this.ctx.approval },
          { name: "verify", approval: this.ctx.approval },
          { name: "summarize", approval: this.ctx.approval }
        ]
      }]
    };
  }

  /** @inheritdoc */
  async approve(_plan: Plan, task: Task, phaseName: string): Promise<boolean> {
    if (this.ctx.approval === "delegate") return true;
    if (isAutoApprove()) return true;
    if (isAutoDeny()) return false;
    // For both manual and confirm-phase, prompt at phase boundaries
    const q = `Approve phase '${phaseName}' for goal '${task.goal}'?`;
    ConsoleLogger.note(q);
    return await promptYesNo(q, true);
  }
}
