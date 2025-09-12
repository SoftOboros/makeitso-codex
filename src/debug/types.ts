export type DebugCommand = {
  op: string; // e.g., "pause", "resume", "breakpoint", "eval"
  args?: Record<string, any>;
};

export type DebugResult = {
  ok: boolean;
  result?: any;
  error?: string;
};

export interface DebugDriver {
  name(): string;
  connect(): Promise<void>;
  execute(cmd: DebugCommand): Promise<DebugResult>;
  close(): Promise<void>;
}

