/*
 SPDX-License-Identifier: MIT
 File: src/telemetry/index.ts
 Description: Auto-generated header for documentation and compliance.
*/
/**
 * Telemetry: append-only JSONL events written locally when enabled.
 */

import fs from "fs";
import path from "path";

export interface TelemetryConfigLite {
  enabled: boolean;
  store: "local" | "none";
  redact?: boolean;
}

export type TelemetryEvent = {
  type:
    | "run_start"
    | "run_end"
    | "phase"
    | "wait_start"
    | "wait_end"
    | "interrupt"
    // Informational annotations
    | "note"
    // Manager-specific annotations
    | "manager_decision"
    | "manager_usage";
  ts: number;
  data: Record<string, any>;
};

export type PhaseEvent = TelemetryEvent & { type: "phase"; data: { name: string; action?: string } };
export type RunStartEvent = TelemetryEvent & { type: "run_start"; data: { goal: string; mode?: string } };
export type RunEndEvent = TelemetryEvent & { type: "run_end"; data: { code: number; durationMs?: number; stdoutBytes?: number; stderrBytes?: number } };

import { getGlobalRedactor } from "../secrets/redact";

export class Telemetry {
  private dir = path.resolve(".makeitso", "telemetry");
  private file = path.join(this.dir, "events.jsonl");

  constructor(private cfg: TelemetryConfigLite) {}

  record(evt: TelemetryEvent) {
    if (!this.cfg?.enabled || this.cfg.store === "none") return;
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
      const red = this.cfg.redact ? getGlobalRedactor() : undefined;
      const out = red ? { ...evt, data: red.redactObj(evt.data) } : evt;
      fs.appendFileSync(this.file, JSON.stringify(out) + "\n");
    } catch {
      // ignore telemetry errors
    }
  }
}
