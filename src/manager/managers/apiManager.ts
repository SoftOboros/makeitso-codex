/**
 * API-model Manager: uses an external LLM (via API) for planning/approvals.
 * NOTE: This is a stub. Plug in your preferred SDK.
 */

import { Manager, ManagerContext, ReviewInput, ManagerDecision } from "../index";
import { Plan, Task } from "../../types";
import { ConsoleLogger } from "../../console/logger";
import { isAutoApprove, isAutoDeny, promptYesNo } from "../util";
import { readBootstrapDoc } from "../context";

export class ApiManager implements Manager {
  private _usage: { prompt?: number; completion?: number; total?: number } = {};
  constructor(private model: string, private ctx: ManagerContext) {}

  /** @inheritdoc */
  async plan(goal: string): Promise<Plan> {
    ConsoleLogger.note(`Manager(${this.model}) planning: budget ${this.ctx.budgetTokens}`);
    // If we have an API key, attempt an OpenAI API call to produce a plan in JSON
    if (this.ctx.apiKey && process.env.MIS_DISABLE_MANAGER_API !== "1") {
      try {
        const plan = await this.generatePlanViaOpenAI(goal);
        if (plan) return plan;
      } catch (e: any) {
        ConsoleLogger.monitor(`Manager API plan failed: ${e?.message || String(e)}`);
      }
    }
    // Fallback: minimal local plan
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

  /** Optional usage summary for token accounting. */
  async usage() {
    // If an SDK provides usage, populate this._usage accordingly.
    // As a minimal bridge, allow env overrides when integrating externally.
    const envTotal = Number(process.env.MIS_MGR_TOTAL_TOKENS || 0);
    const envPrompt = Number(process.env.MIS_MGR_PROMPT_TOKENS || 0);
    const envCompletion = Number(process.env.MIS_MGR_COMPLETION_TOKENS || 0);
    const total = envTotal || this._usage.total;
    const prompt = envPrompt || this._usage.prompt;
    const completion = envCompletion || this._usage.completion;
    return { total, prompt, completion, model: this.model };
  }

  async review(input: ReviewInput): Promise<ManagerDecision> {
    // Simple local heuristic; can be upgraded to call the model again with context for a robust judgement.
    const hasError = /error|exception|failed|traceback/i.test(input.stderr);
    const hasJson = (input.artifacts?.json || []).length > 0;
    if (hasError && !hasJson) {
      return { status: "continue", reason: "errors detected; propose fixes", instructions: "Address errors surfaced in the previous run, then proceed." };
    }
    if (hasJson) {
      return { status: "done", reason: "artifacts emitted and no critical errors" };
    }
    return { status: "continue", reason: "no artifacts detected; propose concrete next steps" };
  }

  // --- Internal helpers ---
  private async generatePlanViaOpenAI(goal: string): Promise<Plan | undefined> {
    const endpoint = this.pickEndpoint();
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.ctx.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.ctx.org) headers["OpenAI-Organization"] = this.ctx.org;

    const prompt = `You are a planning assistant. Given a human goal, produce a concise JSON plan for a CLI orchestrator.
Return ONLY JSON with the exact schema:
{
  "id": string,               // plan id
  "budgetTokens": number,     // copy the provided budget
  "tasks": [{
    "id": string,
    "goal": string,
    "phases": [ { "name": "bootstrap" }, { "name": "task" }, { "name": "verify" }, { "name": "summarize" } ]
  }]
}
Do not include prose. Keep ids short.`;
    // Add compact repo/thread summaries for context (best-effort)
    let __repo = ""; let __thread = "";
    try { const __ctx = require("../context"); __repo = __ctx.readRepoSummary?.('.', 150, 2) || ""; __thread = __ctx.loadThreadSummary?.('.makeitso/sessions', 3, 600) || ""; } catch {}
    const bootstrap = readBootstrapDoc();
    const body = this.isChatModel()
      ? {
          model: this.model,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: `Goal: ${goal}\nBudget tokens: ${this.ctx.budgetTokens}\n\nRepository summary (truncated):\n${__repo}\n\nThread summary (recent):\n${__thread}${bootstrap ? `\n\nBootstrap spec (${bootstrap.name}):\n${bootstrap.content}` : ''}` },
          ],
          temperature: 0.2,
          max_tokens: 600,
        }
      : {
          // Responses API shape (fallback); many models still prefer chat
          model: this.model,
          input: [
            {
              role: "system",
              content: [ { type: "text", text: prompt } ]
            },
            {
              role: "user",
              content: [ { type: "text", text: `Goal: ${goal}\nBudget tokens: ${this.ctx.budgetTokens}\n\nRepository summary (truncated):\n${__repo}\n\nThread summary (recent):\n${__thread}${bootstrap ? `\n\nBootstrap spec (${bootstrap.name}):\n${bootstrap.content}` : ''}` } ]
            }
          ],
          max_output_tokens: 600,
        };
    // Optional request logging (without secrets)
    const LOG_IO = process.env.MIS_LOG_MANAGER_IO === "1";
    const LOG_MAX = Math.max(0, Number(process.env.MIS_LOG_MANAGER_MAX || 0) || 300);
    if (LOG_IO) {
      try {
        const previewIn = this.isChatModel()
          ? `${(body as any).messages?.map((m: any) => `${m.role}: ${String(m.content).slice(0, LOG_MAX)}`).join(" | ")}`
          : `${(body as any).input?.map((m: any) => `${m.role}: ${m.content?.[0]?.text?.slice(0, LOG_MAX) || ""}`).join(" | ")}`;
        ConsoleLogger.monitor(`Manager API request: model=${this.model} endpoint=${endpoint}`);
        ConsoleLogger.monitor(`Manager API prompt: ${previewIn}`);
      } catch {}
    }

    const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) as any });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json: any = await res.json();
    // Capture usage when available
    try {
      const usage = json?.usage;
      // Chat Completions: {prompt_tokens, completion_tokens, total_tokens}
      if (usage && (usage.total_tokens || usage.prompt_tokens || usage.completion_tokens)) {
        this._usage = {
          total: usage.total_tokens,
          prompt: usage.prompt_tokens,
          completion: usage.completion_tokens,
        };
      } else {
        // Responses API may return usage under different keys in future; ignore if absent
      }
    } catch {}
    // Extract text
    let content = "";
    if (this.isChatModel()) {
      content = json?.choices?.[0]?.message?.content || "";
    } else {
      const out = json?.output_text || json?.choices?.[0]?.message?.content || "";
      content = String(out || "");
    }
    if (LOG_IO) {
      try { ConsoleLogger.monitor(`Manager API response: ${String(content).slice(0, LOG_MAX)}`); } catch {}
    }
    // Try to parse JSON; if content contains backticks, extract inside
    const parsed = this.safeParseJson(content);
    if (!parsed) return undefined;
    // Validate minimal shape and inject approval policy
    const plan = parsed as Plan;
    if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) return undefined;
    plan.budgetTokens = this.ctx.budgetTokens;
    for (const t of plan.tasks) {
      for (const p of (t as any).phases || []) {
        (p as any).approval = this.ctx.approval;
      }
    }
    if (!plan.id) plan.id = `plan_${Date.now()}`;
    return plan;
  }

  private pickEndpoint(): string {
    // Prefer Chat Completions endpoint by default
    return this.isChatModel() ? "https://api.openai.com/v1/chat/completions" : "https://api.openai.com/v1/responses";
  }
  private isChatModel(): boolean {
    return /gpt|o\d/i.test(this.model || "");
  }
  private safeParseJson(text: string): any | undefined {
    const t = (text || "").trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fence ? fence[1] : t;
    try { return JSON.parse(raw); } catch { return undefined; }
  }
}
