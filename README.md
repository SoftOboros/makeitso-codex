<div align="center">
  <img src="makeitso-codex-illustration.png" alt="Make It So, Codex — A Picard‑style bridge command for your Codex engineering department." width="720" />
  <h1><strong>Make It So, Codex</strong></h1>
  
</div>

---

## Quickstart

```bash
# in this folder
npm i
npm run build
# initialize config and protocol files
npx mis init
# dry-run a plan
npx mis plan "fix failing tests in repo X"
# run with current approvals
npx mis run "demo goal"
```


## Features

- Orchestrator + Manager: plans and executes goals with approval policies.
- Worker integration: CLI/API with delimited output capture and artifact parsing.
- Monitor agent: detects stalls/danger and can interrupt safely.
- Remote monitor: full‑duplex WS hook with control commands and optional HMAC.
- Regex library + learning: coverage reporting, proposals, and gated approval.
- Sandbox policies: gate shell/network/file writes (auto/ask/never).
- Telemetry: structured JSONL events, audit summaries, durations/bytes.
- Debug bridge: manager emits `DBG:{...}` commands → routed to debugger driver (Node inspector supported), with `DBG-OK`/`DBG-ERR` feedback.
- Developer UX: VS Code launch configs (CLI/tests), `mis open <url>` for local/containers.

## Install

```bash
npm i
npm run build
npx mis init
```

## Why

Codex is a superb <em>worker</em>. This package adds a <strong>Manager</strong> that turns a bridge command (“make it so”) into a concrete plan, runs Codex workers, parses their delimited output, and self‑tunes the parser via a feedback loop.

See <a href="./PLAN.md">PLAN.md</a> for the architecture and test strategy.

## Common Workflows

- Plan only: `mis plan "upgrade build tooling"`
- Run with approvals: `mis run "refactor module X"`
- Learn from replays: `mis learn` (shows coverage and may create a regex proposal)
- Approve a proposal: `mis approve .makeitso/proposals/regex_*.toml`
- Audit recent activity: `mis audit`
- Open/print a URL: `mis open https://example.com` (behavior controlled by `[ui]`)



## Configuration (config.toml)

Key sections you may want to tweak:

```toml
[project]
name = "acme"
root = "./"
artifacts_dir = ".makeitso/artifacts"

[manager]
# "codex" or "api:<model>"
kind = "api:gpt-5-instant"
approval = "confirm-phase"        # "manual" | "confirm-phase" | "delegate"
budget_tokens = 250000
max_concurrency = 2
api_key_env = "OPENAI_API_KEY"     # optional, for api:* manager flows
org_env = "OPENAI_ORG"             # optional

[workers.codex]
run_via = "api"                    # "cli" | "api"
profile = "default"
api_endpoint = ""                  # optional base URL
api_key_env = "CODEX_API_KEY"      # env var for token
model = "default"
delimiters = { start = "<<MIS:START>>", end = "<<MIS:END>>", json = "<<MIS:JSON>>", err = "<<MIS:ERR>>" }

[policies]
write_files = "ask"                 # "never" | "ask" | "auto"
run_shell  = "ask"
network    = "ask"

[telemetry]
enabled = true
redact  = true
store   = "local"                   # "local" | "none"

[learning]
mode = "shadow"                     # "off" | "shadow" | "canary" | "auto"
regex_repo  = "./protocol/regexes.toml"
prompt_repo = "./protocol/prompts/"
replay_dir  = ".makeitso/replays"

[monitor]
enabled = true
stall_timeout_ms = 120000
dangerous_regexes = [ ]

[remote_monitor]
enabled = false
server_url = "wss://example.com/monitor"
api_key_env = "REMOTE_MONITOR_API_KEY"
sign_hmac = true

[wait]
enabled = true
strategy = "fixed"                  # "fixed" | "expo"
base_ms = 0
max_ms = 0
pre_task_wait_ms = 0

[debug]
enabled = false
driver = "node-inspector"           # or "dgdb" (placeholder)
inspector_url = "ws://127.0.0.1:9229"

[ui]
open_url = "auto"                   # "auto" | "print" | "command"
open_url_command = "curl -I"        # used when open_url = "command"
```



## CLI

More detail on command workflow: [COMMANDS.md](./COMMANDS.md)


```bash
mis init                          # scaffold config and protocol files
mis plan <goal>                   # generate a plan (no execution)
mis run <goal>                    # execute with current approval policy
mis audit                         # summarize telemetry and artifacts
mis learn                         # coverage + proposal generation
mis approve <file>                # apply proposal (e.g., regex TOML)
mis open <url>                    # open/print URL per config/ui policy
```

Global flags:
- `--non-interactive`/`-y`: auto‑approve prompts where allowed
- `--force-stub`: force stubbed Codex worker
- `--inspect-url <ws://..>`: override debug inspector URL (sets `MIS_INSPECT_URL`)
- `--codex-key <token>`: set env for `workers.codex.api_key_env` (fallback `CODEX_API_KEY`)

## Debug Quickstart

- Enable `[debug]` in config and start your target with an inspector endpoint.
- Optionally pass `--inspect-url ws://127.0.0.1:9229` when running `mis`.
- From the Manager notes, issue commands:
  - Pause: `DBG:{"op":"pause"}`
  - Eval: `DBG:{"op":"eval","args":{"expr":"2+2"}}`
  - Breakpoint: `DBG:{"op":"breakpoint","args":{"file":"src/foo.ts","line":42}}`
- The app responds with `DBG-OK: ...` or `DBG-ERR: ...` directly to the Manager stream.

## Monitor and Remote Control

- Enable `[monitor]` to detect stalls/danger and interrupt.
- Enable `[remote_monitor]` for full‑duplex WS with optional HMAC (`x-mis-ts`/`x-mis-sig`).
- Remote commands examples (JSON over WS):
  - `{"type":"interrupt","reason":"operator stop"}`
  - `{"type":"danger","action":"add","pattern":"rm\s+-rf\s+./"}`
  - `{"type":"set","field":"stall_timeout_ms","value":60000}`

## Debugger Bridge

- Enable `[debug]` to accept manager‑emitted debug commands.
- Manager emits notes like: `DBG:{"op":"pause"}` or `DBG:{"op":"breakpoint","args":{"file":"src/foo.ts","line":42}}`
- App routes to the selected driver (Node inspector or DGDB placeholder) and returns:
  - `DBG-OK: {...}` on success
  - `DBG-ERR: reason` on error (invalid JSON, driver not connected, unsupported op)
- Node Inspector:
  - Start target with `--inspect` or `--inspect-brk`.
  - Set `debug.inspector_url` or pass `--inspect-url ws://127.0.0.1:9229`.
  - Requires `ws` installed at runtime.
- DGDB: scaffold in place for later gdb/gdbserver/probe‑rs workflows.

## Telemetry and Audit

- JSONL events in `.makeitso/telemetry/events.jsonl` (when enabled).
- Events: `run_start`, `phase`, `wait_start`, `wait_end`, `interrupt`, `run_end` (with durations/bytes).
- `mis audit` prints runs, waits, interrupts, averages, plus replay/artifact stats.

## Sandbox Policies

- `run_shell`, `network`, `write_files` can be `auto`, `ask`, or `never`.
- Govern Codex CLI spawn, remote monitor/inspector sockets, and writing replays/artifacts/telemetry.

## Containers and Headless

- Set `[ui] open_url = "print"` to avoid opening a browser; use `mis open <url>` to print.
- Or set `[ui] open_url = "command"` with `open_url_command = "curl -I"`.

## VS Code Debugging

- See `.vscode/launch.json`:
  - "CLI: mis (ts-node)" (edit args, e.g., ["run","demo goal"]).
  - "CLI: mis (dist)" and "Tests: run suite (dist)" (auto builds first).
  - "Attach: Node process" to attach to an inspector‑enabled node.
  - Optional "NPM: test (debug)" configuration to break on test startup.

## Contact

- Email: ira@softoboros.com

## Security Notes

- Redaction is on by default; telemetry is local and opt‑in.
- Favor short‑lived credentials and least‑privilege access in your environment.
