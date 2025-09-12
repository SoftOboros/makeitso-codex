/*
 SPDX-License-Identifier: MIT
 File: src/debug/router.ts
 Description: Auto-generated header for documentation and compliance.
*/
import { DebugDriver, DebugCommand } from "./types";

let globalRouter: DebugRouter | undefined;
export function setGlobalDebugRouter(r?: DebugRouter) { globalRouter = r; }
export function getGlobalDebugRouter(): DebugRouter | undefined { return globalRouter; }

export class DebugRouter {
  constructor(private driver?: DebugDriver) {}

  setDriver(d?: DebugDriver) { this.driver = d; }

  // Returns a string response for manager consumption, or undefined if not a debug command
  async tryRoute(line: string): Promise<string | undefined> {
    const m = line.match(/^\s*DBG\s*:(.*)$/); // e.g., DBG:{"op":"pause"}
    if (!m) return undefined;
    let cmd: DebugCommand;
    try { cmd = JSON.parse(m[1]); }
    catch { return `DBG-ERR: invalid JSON in command`; }
    if (!this.driver) return `DBG-ERR: no debug driver available`;
    try {
      const res = await this.driver.execute(cmd);
      if (res.ok) return `DBG-OK: ${JSON.stringify(res.result ?? null)}`;
      return `DBG-ERR: ${res.error || "unknown error"}`;
    } catch (e: any) {
      return `DBG-ERR: ${e?.message || String(e)}`;
    }
  }
}

