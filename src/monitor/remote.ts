/**
 * RemoteMonitor: optional hook to obtain a remote monitoring WebSocket and
 * mirror events for full-duplex observation and control.
 *
 * Notes:
 * - Uses dynamic require('ws') at runtime; if unavailable or disabled, no-ops.
 * - Exposes `onEvent` to send stream events; listens for remote commands like
 *   { type: 'interrupt', reason: '...' } or { type: 'note', message: '...' }.
 */

import { ConsoleLogger } from "../console/logger";
import crypto from "crypto";

export interface RemoteOptions {
  serverUrl: string;
  apiKey?: string;
  signHmac?: boolean;
}

export class RemoteMonitor {
  private ws: any | undefined;
  private interrupted = false;
  private reasonText: string | undefined;

  constructor(private opts: RemoteOptions) {}

  async connect(): Promise<void> {
    if (!this.opts.serverUrl) return;
    let WebSocket: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      WebSocket = require("ws");
    } catch {
      ConsoleLogger.note("Remote monitor disabled: 'ws' module not installed");
      return;
    }

    // TBD API: assume serverUrl is already a WS endpoint for now
    try {
      const headers: Record<string, string> = {};
      if (this.opts.apiKey) headers["authorization"] = `Bearer ${this.opts.apiKey}`;
      if (this.opts.signHmac && this.opts.apiKey) {
        const ts = Date.now().toString();
        const sig = crypto.createHmac("sha256", this.opts.apiKey).update(ts).digest("hex");
        headers["x-mis-ts"] = ts;
        headers["x-mis-sig"] = sig;
      }
      this.ws = new WebSocket(this.opts.serverUrl, { headers });
      this.ws.on("open", () => ConsoleLogger.note("Remote monitor connected"));
      this.ws.on("message", (raw: any) => this.onRemoteMessage(raw));
      this.ws.on("error", () => ConsoleLogger.note("Remote monitor socket error"));
      this.ws.on("close", () => ConsoleLogger.note("Remote monitor disconnected"));
    } catch {
      ConsoleLogger.note("Remote monitor connection failed");
    }
  }

  onEvent(event: any) {
    if (!this.ws || this.ws.readyState !== 1) return;
    try { this.ws.send(JSON.stringify({ type: "event", event })); } catch {}
  }

  shouldInterrupt(): boolean { return this.interrupted; }
  reason(): string | undefined { return this.reasonText; }
  clearInterrupt() { this.interrupted = false; this.reasonText = undefined; }

  private onRemoteMessage(raw: any) {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "interrupt") {
      this.interrupted = true;
      this.reasonText = msg.reason || "remote interrupt";
      ConsoleLogger.monitor(`Remote interrupt: ${this.reasonText}`);
    } else if (msg.type === "note" && typeof msg.message === "string") {
      ConsoleLogger.monitor(`Note: ${msg.message}`);
    } else if (msg.type === "set" && msg.field) {
      // Forward as control event for orchestrator to apply
      this.emitCommand({ type: "set", field: String(msg.field), value: msg.value });
    } else if (msg.type === "danger") {
      const action = msg.action || "add";
      this.emitCommand({ type: "danger", action, pattern: msg.pattern });
    }
  }

  // Command plumbing
  private cmdCb: ((cmd: RemoteCommand) => void) | undefined;
  onCommand(cb: (cmd: RemoteCommand) => void) { this.cmdCb = cb; }
  private emitCommand(cmd: RemoteCommand) { try { this.cmdCb?.(cmd); } catch {} }
}

export type RemoteCommand =
  | { type: "set"; field: string; value: any }
  | { type: "danger"; action: "add" | "clear"; pattern?: string };
