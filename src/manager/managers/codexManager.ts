/**
 * Codex-as-Manager: uses Codex itself at a higher level for planning and approvals.
 * NOTE: This is a stub. Wire to Codex CLI/API as you enable it.
 */

import { Manager, ManagerContext } from "../index";
import { Plan, Task } from "../../types";

export class CodexManager implements Manager {
  constructor(private ctx: ManagerContext) {}

  /** @inheritdoc */
  async plan(goal: string): Promise<Plan> {
    // TODO: replace with Codex prompt call
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
  async approve(_plan: Plan, _task: Task, _phaseName: string): Promise<boolean> {
    // Delegate by default; hook approval policy later
    return this.ctx.approval !== "manual";
  }
}
