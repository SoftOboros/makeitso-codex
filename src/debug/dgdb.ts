/*
 SPDX-License-Identifier: MIT
 File: src/debug/dgdb.ts
 Description: Auto-generated header for documentation and compliance.
*/
import { DebugDriver, DebugCommand, DebugResult } from "./types";
import net from "net";
import { parseMiFrames } from "./mi";

export class DgdbDriver implements DebugDriver {
  private sock?: net.Socket;
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, (line: string) => void>();

  constructor(private endpoint: string) {}
  name() { return "dgdb"; }
  async connect(): Promise<void> {
    if (!this.endpoint) throw new Error("dgdb endpoint missing");
    const { host, port } = parseTcpEndpoint(this.endpoint);
    await new Promise<void>((resolve, reject) => {
      const s = net.createConnection({ host, port }, () => resolve());
      s.on("data", (chunk) => this.onData(chunk));
      s.on("error", (e) => reject(e));
      this.sock = s;
    });
  }
  private onData(chunk: Buffer) {
    this.buf += chunk.toString("utf-8");
    let idx;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trimEnd();
      this.buf = this.buf.slice(idx + 1);
      const m = line.match(/^(\d+)\^(.*)$/);
      if (m) {
        const id = Number(m[1]);
        const cb = this.pending.get(id);
        if (cb) { this.pending.delete(id); cb(line); }
      }
    }
  }
  private sendMi(cmd: string, timeoutMs = 2000): Promise<string> {
    if (!this.sock) return Promise.reject(new Error("not connected"));
    const id = this.nextId++;
    const line = `${id}${cmd}\n`;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("dgdb timeout"));
      }, timeoutMs);
      this.pending.set(id, (resLine: string) => {
        clearTimeout(timer);
        resolve(resLine);
      });
      try { this.sock!.write(line, "utf-8"); } catch (e) { clearTimeout(timer); reject(e as any); }
    });
  }
  async execute(cmd: DebugCommand): Promise<DebugResult> {
    try {
      if (cmd.op === "pause") {
        const res = await this.sendMi("-exec-interrupt");
        return { ok: true, result: { paused: /\^done/.test(res) } };
      }
      if (cmd.op === "step") {
        const res = await this.sendMi("-exec-step", 5000);
        const running = /\^running/.test(res);
        return { ok: true, result: { running } };
      }
      if (cmd.op === "stack") {
        const res = await this.sendMi("-stack-list-frames", 5000);
        const frames = parseMiFrames(res);
        return { ok: true, result: { frames } };
      }
      return { ok: false, error: `dgdb unsupported op: ${cmd.op}` };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
  async close(): Promise<void> { try { this.sock?.destroy(); } catch {} }
}

function parseTcpEndpoint(ep: string): { host: string; port: number } {
  let s = ep.replace(/^tcp:\/\//i, "");
  const parts = s.split(":");
  if (parts.length < 2) throw new Error("invalid tcp endpoint");
  const host = parts[0];
  const port = Number(parts[1]);
  if (!host || !port) throw new Error("invalid tcp endpoint");
  return { host, port };
}
