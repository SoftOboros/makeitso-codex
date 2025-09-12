import path from "path";
import fs from "fs";
// Avoid depending on 'toml' runtime for tests in restricted envs.

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export function run() {
  const cfgPath = path.resolve("config.toml");
  if (!fs.existsSync(cfgPath)) {
    throw new Error("config.toml missing; run `mis init` first in tests");
  }
  const text = fs.readFileSync(cfgPath, "utf-8");
  assert(/\[project\]/.test(text) && /\[manager\]/.test(text), "config missing required sections");
  assert(/delimiters/.test(text), "config missing delimiters section");
}
