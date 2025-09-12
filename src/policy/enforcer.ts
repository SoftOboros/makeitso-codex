import { PoliciesConfig } from "../config";
import { isAutoApprove, isAutoDeny, promptYesNo } from "../manager/util";

export class PolicyEnforcer {
  constructor(private policies: PoliciesConfig) {}

  async allowRunShell(reason = "run external CLI"): Promise<boolean> {
    return this.decide(this.policies.run_shell, `Allow shell: ${reason}?`);
  }

  async allowNetwork(reason = "open network connection"): Promise<boolean> {
    return this.decide(this.policies.network, `Allow network: ${reason}?`);
  }

  async allowWriteFiles(reason = "write artifacts/telemetry"): Promise<boolean> {
    return this.decide(this.policies.write_files, `Allow write: ${reason}?`);
  }

  private async decide(policy: "never" | "ask" | "auto", question: string): Promise<boolean> {
    if (policy === "auto") return true;
    if (policy === "never") return false;
    if (isAutoApprove()) return true;
    if (isAutoDeny()) return false;
    return await promptYesNo(question, true);
  }
}

