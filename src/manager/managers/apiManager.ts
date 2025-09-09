/**
 * API-model Manager: uses an external LLM (via API) for planning/approvals.
 * NOTE: This is a stub. Plug in your preferred SDK.
 */

import { Manager, ManagerContext } from "../index";
import { Plan, Task } from "../../types";

export class ApiManager implements Manager {
  constructor(private model: string, private ctx: ManagerContext) {}

  /** @inheritdoc */
  async plan(goal: string): Promise<Plan> {
    // TODO: call your LLM API with a planning prompt; use ctx.budgetTokens
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
    // TODO: perform approval via API model; for now mirror policy
    return this.ctx.approval !== "manual";
  }
}
