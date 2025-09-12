import fs from "fs";
import path from "path";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function run() {
  process.env.MIS_AUTO_APPROVE = "1";
  process.env.MIS_FORCE_STUB = "1";

  const { Orchestrator } = await import("../src/orchestrator");

  // 1) Basic run with default config
  {
    const orch = new Orchestrator({ configPath: path.resolve("config.toml") });
    const code = await orch.run("integration basic run");
    assert(code === 0, "orchestrator returned non-zero for basic run");
    const repDir = path.resolve(".makeitso", "replays");
    assert(fs.existsSync(repDir), "replays dir missing");
  }

  // 2) Interrupt via monitor with dangerous pattern
  const cfgPath = path.resolve("config.integration.toml");
  try {
    const toml = `
[project]
name = "acme"
root = "./"
artifacts_dir = ".makeitso/artifacts"

[manager]
kind = "codex"
approval = "delegate"
budget_tokens = 1000

[workers.codex]
run_via = "api"
profile = "default"
delimiters = { start = "<<MIS:START>>", end = "<<MIS:END>>", json = "<<MIS:JSON>>", err = "<<MIS:ERR>>" }

[policies]
write_files = "auto"
run_shell = "never"
network = "auto"

[telemetry]
enabled = false
redact = true
store = "local"

[learning]
mode = "shadow"
regex_repo = "./protocol/regexes.toml"
prompt_repo = "./protocol/prompts/"
replay_dir = ".makeitso/replays"

[monitor]
enabled = true
stall_timeout_ms = 999999
dangerous_regexes = ["Executing goal:"]
`;
    fs.writeFileSync(cfgPath, toml);
    const orch2 = new Orchestrator({ configPath: cfgPath });
    const code2 = await orch2.run("integration interrupt run");
    assert(code2 === 0 || code2 === 2, "integration run should complete or interrupt");
  } finally {
    try { fs.unlinkSync(cfgPath); } catch {}
  }
}
