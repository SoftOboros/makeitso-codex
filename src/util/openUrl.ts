/*
 SPDX-License-Identifier: MIT
 File: src/util/openUrl.ts
 Description: Auto-generated header for documentation and compliance.
*/
import { UIConfig } from "../config";
import { PolicyEnforcer } from "../policy/enforcer";
import { ConsoleLogger } from "../console/logger";
import { spawn } from "child_process";

export async function openUrl(url: string, ui: UIConfig | undefined, enforcer: PolicyEnforcer): Promise<void> {
  const mode = ui?.open_url || "auto";
  if (mode === "print") {
    ConsoleLogger.note(`Open this URL: ${url}`);
    return;
  }
  if (mode === "command" && ui?.open_url_command) {
    const allowed = await enforcer.allowRunShell("open-url command");
    if (!allowed) { ConsoleLogger.note(`Open this URL: ${url}`); return; }
    try {
      const parts = ui.open_url_command.split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1).map((a) => a.replace(/\{url\}/g, url));
      spawn(cmd, [...args, url], { stdio: "ignore", detached: true }).unref();
      return;
    } catch { ConsoleLogger.note(`Open this URL: ${url}`); return; }
  }
  // auto: try xdg-open/open/start depending on platform, else print
  const allowed = await enforcer.allowRunShell("open browser");
  if (!allowed) { ConsoleLogger.note(`Open this URL: ${url}`); return; }
  const plat = process.platform;
  const candidates = plat === "darwin" ? ["open"] : plat === "win32" ? ["cmd", "/c", "start"] : ["xdg-open"];
  try {
    if (plat === "win32") spawn(candidates[0], candidates.slice(1).concat([url]), { stdio: "ignore", detached: true }).unref();
    else spawn(candidates[0], [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    ConsoleLogger.note(`Open this URL: ${url}`);
  }
}
