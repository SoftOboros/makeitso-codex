/**
 * API-model Manager: uses an external LLM (via API) for planning/approvals.
 * NOTE: This is a stub. Plug in your preferred SDK.
 */

import { Manager, ManagerContext } from "../index";
import { Plan, Task } from "../../types";
import { isAutoApprove, isAutoDeny, promptYesNo } from "../util";
import { ConsoleLogger } from "../../console/logger";

export class ApiManager implements Manager {
  constructor(private model: string, private ctx: ManagerContext) {}

  /** @inheritdoc */
  async plan(goal: string): Promise<Plan> {
    // TODO: call your LLM API with a planning prompt; use ctx.budgetTokens
    // Credentials are provided via ctx.apiKey and ctx.org if configured.
    ConsoleLogger.note(`Manager(${this.model}) planning: budget ${this.ctx.budgetTokens}`);
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
    // Prompt user in manual/confirm-phase
    const q = `Approve phase '${phaseName}' for goal '${task.goal}'?`;
    ConsoleLogger.note(q);
    return await promptYesNo(q, true);
  }
}
