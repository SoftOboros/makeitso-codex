/**
 * Monitor: observes all streams and can request interrupts on stall/danger.
 */

export type MonitorEventType =
  | "start"
  | "end"
  | "phase"
  | "stdout"
  | "stderr"
  | "manager-note"
  | "command";

export interface MonitorEvent {
  type: MonitorEventType;
  data: string;
  timestamp: number;
}

export interface MonitorOptions {
  stallTimeoutMs: number;
  dangerousRegexes?: RegExp[];
}

export interface Monitor {
  onEvent(e: MonitorEvent): void;
  shouldInterrupt(): boolean;
  reason(): string | undefined;
  reset(): void;
  addDanger(rx: RegExp): void;
  clearDanger(): void;
  setStallTimeout(ms: number): void;
}

/**
 * BasicMonitor: simple timers and regex-based danger detection.
 */
export class BasicMonitor implements Monitor {
  private lastActivity = Date.now();
  private interrupted = false;
  private reasonText: string | undefined;
  private danger: RegExp[];

  constructor(private opts: MonitorOptions) {
    const builtIns = [
      /rm\s+-rf\s+\/(?!tmp)/i,
      /drop\s+table/i,
      /mkfs/i,
      /:(){:|:&};:/, // fork bomb
      /chmod\s+777\s+-R/i,
      /curl\s+[^|]+\|\s*sh/i,
      /git\s+reset\s+--hard/i,
      /sudo\s+/i,
      /scp\s+.*@\d+\.\d+\.\d+\.\d+:/i,
      /nc\s+-e\s+/i,
      /openssl\s+enc\s+-aes/i,
      /python\s+-c\s+["']import\s+os;\s*os\.system/i,
    ];
    this.danger = [...builtIns, ...(opts.dangerousRegexes || [])];
  }

  onEvent(e: MonitorEvent): void {
    // activity updates
    if (e.type === "stdout" || e.type === "stderr" || e.type === "manager-note" || e.type === "phase") {
      this.lastActivity = e.timestamp;
    }
    // danger patterns
    if ((e.type === "stderr" || e.type === "command" || e.type === "stdout") && !this.interrupted) {
      for (const rx of this.danger) {
        if (rx.test(e.data)) {
          this.interrupted = true;
          this.reasonText = `dangerous pattern detected: ${rx.source}`;
          return;
        }
      }
    }

    // stall detection
    const now = Date.now();
    if (!this.interrupted && now - this.lastActivity > this.opts.stallTimeoutMs) {
      this.interrupted = true;
      this.reasonText = `stall detected: >${this.opts.stallTimeoutMs}ms inactivity`;
    }
  }

  shouldInterrupt(): boolean { return this.interrupted; }
  reason(): string | undefined { return this.reasonText; }
  reset(): void {
    this.interrupted = false;
    this.reasonText = undefined;
    this.lastActivity = Date.now();
  }

  addDanger(rx: RegExp): void { this.danger.push(rx); }
  clearDanger(): void { this.danger = []; }
  setStallTimeout(ms: number): void { this.opts.stallTimeoutMs = ms; }
}
