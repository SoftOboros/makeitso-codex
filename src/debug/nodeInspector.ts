/*
 SPDX-License-Identifier: MIT
 File: src/debug/nodeInspector.ts
 Description: Auto-generated header for documentation and compliance.
*/
import { DebugDriver, DebugCommand, DebugResult } from "./types";

export class NodeInspectorDriver implements DebugDriver {
  private ws: any | undefined;
  private id = 1;
  constructor(private url: string) {}
  name() { return "node-inspector"; }

  async connect(): Promise<void> {
    let WebSocket: any;
    try { WebSocket = require("ws"); } catch {
      throw new Error("ws module not installed; cannot connect to inspector");
    }
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.ws.on("open", () => resolve());
        this.ws.on("error", (e: any) => reject(e));
      } catch (e) { reject(e); }
    });
  }

  async execute(cmd: DebugCommand): Promise<DebugResult> {
    if (!this.ws || this.ws.readyState !== 1) {
      return { ok: false, error: "inspector not connected" };
    }
    const map: Record<string, { method: string; params?: any }> = {
      pause: { method: "Debugger.pause" },
      resume: { method: "Debugger.resume" },
      breakpoint: { method: "Debugger.setBreakpointByUrl", params: { lineNumber: cmd.args?.line ?? 0, url: cmd.args?.url || cmd.args?.file, columnNumber: cmd.args?.col ?? 0 } },
      eval: { method: "Runtime.evaluate", params: { expression: String(cmd.args?.expr || "") } },
    };
    const m = map[cmd.op];
    if (!m) return { ok: false, error: `unsupported op: ${cmd.op}` };
    const id = this.id++;
    const payload = JSON.stringify({ id, method: m.method, params: m.params || {} });
    return new Promise((resolve) => {
      const onMessage = (raw: any) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.id === id) {
            this.ws.removeListener("message", onMessage);
            if (msg.error) resolve({ ok: false, error: msg.error.message || String(msg.error) });
            else resolve({ ok: true, result: msg.result });
          }
        } catch {}
      };
      this.ws.on("message", onMessage);
      try { this.ws.send(payload); }
      catch (e: any) { resolve({ ok: false, error: e?.message || String(e) }); }
    });
  }

  async close(): Promise<void> {
    try { this.ws?.close(); } catch {}
  }
}

