/**
 * Codex-as-Manager: uses Codex itself at a higher level for planning and approvals.
 * NOTE: This is a stub. Wire to Codex CLI/API as you enable it.
 */

import { Manager, ManagerContext, ReviewInput, ManagerDecision } from "../index";
import { Plan, Task } from "../../types";
import { isAutoApprove, isAutoDeny, promptYesNo } from "../util";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { ConsoleLogger } from "../../console/logger";
import { readBootstrapDoc, readRepoSummary, loadThreadSummary } from "../context";

export class CodexManager implements Manager {
  constructor(private ctx: ManagerContext) {}

  /** @inheritdoc */
  async plan(goal: string): Promise<Plan> {
    const via = (this.ctx.codexRunVia || "api").toLowerCase();
    ConsoleLogger.note(`Manager(codex via ${via}) planning: budget ${this.ctx.budgetTokens}`);
    if (via === "api" && this.ctx.apiKey) {
      try {
        const plan = await this.generatePlanViaOpenAI(goal);
        if (plan) return plan;
      } catch (e: any) {
        ConsoleLogger.monitor(`Codex(api) planning failed: ${e?.message || String(e)}`);
      }
    } else if (via === "cli") {
      try {
        const plan = await this.generatePlanViaCodexCLI(goal);
        if (plan) return plan;
      } catch (e: any) {
        ConsoleLogger.monitor(`Codex(cli) planning failed: ${e?.message || String(e)}`);
      }
    }
    // Fallback minimal plan
    return this.minimalPlan(goal);
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

  async review(input: ReviewInput): Promise<ManagerDecision> {
    // Heuristic: if stderr contains obvious errors, continue; if we captured at least one JSON artifact, tentatively done.
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
}

// ---------- helpers ----------

function buildPlanPrompt(goal: string, budget: number): string {
  const repo = readRepoSummary('.', 150);
  const thread = loadThreadSummary('.makeitso/sessions', 3, 600);
  const bootstrap = readBootstrapDoc();
  return `You are a planning assistant for a code execution orchestrator.\n\nTask: Create a JSON-only plan for achieving the goal below.\n\nRules:\n- OUTPUT ONLY JSON matching the provided schema. No prose.\n- Do not write files; this is read-only planning.\n- Keep ids short.\n- Phases must be: bootstrap → task → verify → summarize.\n\nSchema:\n{\n  "id": string,\n  "budgetTokens": number,\n  "tasks": [{\n    "id": string,\n    "goal": string,\n    "phases": [ { "name": "bootstrap" }, { "name": "task" }, { "name": "verify" }, { "name": "summarize" } ]\n  }]\n}\n\nBudget tokens: ${budget}\nGoal: ${goal}\n\nRepository summary (truncated):\n${repo}\n\nThread summary (recent):\n${thread}${bootstrap ? `\n\nBootstrap spec (${bootstrap.name}):\n${bootstrap.content}` : ''}`;
}

function safeParseFencedOrJson(text: string): any | undefined {
  const t = String(text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : t;
  try { return JSON.parse(raw); } catch { return undefined; }
}

private minimalPlan(goal: string): Plan {
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

private async generatePlanViaOpenAI(goal: string): Promise<Plan | undefined> {
  const model = this.ctx.codexModel || "gpt-4o-mini";
  const endpoint = "https://api.openai.com/v1/chat/completions";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${this.ctx.apiKey}`,
    "Content-Type": "application/json",
  };
  if (this.ctx.org) headers["OpenAI-Organization"] = this.ctx.org;
  const system = buildPlanPrompt(goal, this.ctx.budgetTokens) +
    `\n\nRepository summary (truncated):\n${readRepoSummary('.', 150)}\n\nThread summary (recent):\n${loadThreadSummary('.makeitso/sessions', 3, 600)}`;
  const body = {
    model,
    messages: [ { role: "system", content: system } ],
    temperature: 0.2,
    max_tokens: 600,
  } as any;
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) as any });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json: any = await res.json();
  const content = json?.choices?.[0]?.message?.content || "";
  const parsed = safeParseFencedOrJson(content);
  if (!parsed) return undefined;
  const plan = parsed as Plan;
  if (!plan?.tasks?.length) return undefined;
  plan.budgetTokens = this.ctx.budgetTokens;
  for (const t of plan.tasks) {
    for (const p of (t as any).phases || []) (p as any).approval = this.ctx.approval;
  }
  return plan;
}

private async generatePlanViaCodexCLI(goal: string): Promise<Plan | undefined> {
  return await new Promise<Plan | undefined>((resolve) => {
    const repoSummary = readRepoSummary(".", 200);
    const thread = loadThreadSummary('.makeitso/sessions', 3, 600);
    const prompt = `${buildPlanPrompt(goal, this.ctx.budgetTokens)}\n\nRepository summary (read-only):\n${repoSummary}\n\nThread summary (recent):\n${thread}`;
    const env = { ...process.env } as any;
    // Inject API key for Codex CLI if available
    if (this.ctx.apiKey) {
      env.OPENAI_API_KEY = env.OPENAI_API_KEY || this.ctx.apiKey;
    }
    // Avoid inheriting debugger flags to child
    delete env.NODE_OPTIONS;
    const proc = spawn("codex", [prompt], { stdio: ["ignore", "pipe", "pipe"], env });
    let out = ""; let err = "";
    const timer = setTimeout(() => { try { proc.kill("SIGTERM"); } catch {} }, 60000);
    proc.stdout.on("data", (c) => { out += c.toString("utf-8"); });
    proc.stderr.on("data", (c) => { err += c.toString("utf-8"); });
    proc.on("close", () => {
      clearTimeout(timer);
      // Try to parse JSON from output (prefer fenced blocks)
      const parsed = safeParseFencedOrJson(out) || safeParseFencedOrJson(err);
      if (!parsed) { resolve(undefined); return; }
      try {
        const plan = parsed as Plan;
        if (!plan?.tasks?.length) { resolve(undefined); return; }
        plan.budgetTokens = this.ctx.budgetTokens;
        for (const t of plan.tasks) for (const p of (t as any).phases || []) (p as any).approval = this.ctx.approval;
        resolve(plan);
      } catch { resolve(undefined); }
    });
    proc.on("error", () => { try { clearTimeout(timer); } catch {}; resolve(undefined); });
  });
}
