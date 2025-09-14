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
mis plan-bootstrap <goal> [BASE.md] # seed planning and print JSON only (no execution)
mis bootstrap <goal> [BASE.md]    # seed planning from BOOTSTRAP.md (or custom), then run
mis run <goal>                    # execute with current approval policy
mis audit                         # summarize telemetry and artifacts
mis learn                         # coverage + proposal generation
mis approve <file>                # apply proposal (e.g., regex TOML)
mis open <url>                    # open/print URL per config/ui policy
mis profile                       # show active profile and effective settings
```

Global flags:
- `--non-interactive`/`-y`: auto‑approve prompts where allowed
- `--force-stub`: force stubbed Codex worker
- `--inspect-url <ws://..>`: override debug inspector URL (sets `MIS_INSPECT_URL`)
- `--codex-key <token>`: set env for `workers.codex.api_key_env` (fallback `CODEX_API_KEY`)
- `--profile dev|debug|ci`: select runtime profile (overrides `[ui].profile`)
- `--child-arg <tok>` / `--child-args "..."`: pass extra flags to the child CLI before the goal (e.g., `-y --no-color`)
- `--dangerous-full-auto-self-driving-mode`: playful but real — enables CI-like full auto: auto-approve prompts, CI profile, bounded auto-iterations (10)
- `--write-plan`: write generated plan JSON to `.makeitso/plan_<timestamp>.json` (applies to plan, plan-bootstrap, and run)

Bootstrap seeding
- `mis bootstrap <goal> [BASE.md]` reads BOOTSTRAP.md (or the provided base name) and seeds the manager’s planning prompt with it, along with a truncated repository and recent thread summary. The generated plan is displayed before approvals and subsequent phases run as normal (subject to your approval policy and profile).
- `mis plan-bootstrap <goal> [BASE.md]` behaves the same but only prints the plan JSON; it does not execute phases. Combine with `--write-plan` to persist.

## Profiles

Avoid juggling many flags by using profiles. A profile sets sensible defaults for child I/O, logging, and timeouts.

- dev: stdin_only=on, interactive=off, plain=on, timeout≈15s, readable logs.
- debug: dev + verbose diagnostics; ideal for stepping and pausing.
- ci: stdin_only=off, interactive=off, plain=on, timeout≈60s; deterministic.

Selection order: `--profile` flag → `config.toml [ui].profile` → auto (CI→ci, debugger/verbose→debug, else dev).

Examples:

- CLI: `mis --profile dev run "Update docs"`
- Show active profile: `mis profile`
- In config.toml:

```
[ui]
profile = "dev"  # or "debug" | "ci"
```

Worker tuning in config.toml (advanced; usually set by profile):

```
[workers.codex]
stdin_only = true   # inherit only stdin; keep stdout/stderr captured
interactive = false # inherit full stdio when true (bypass capture)
plain = true        # request plain output (no color/spinners)
# extra_args = ["-y"]
# timeout_ms = 15000
```

## Debug Quickstart

- Enable `[debug]` in config and start your target with an inspector endpoint.
- Optionally pass `--inspect-url ws://127.0.0.1:9229` when running `mis`.
- From the Manager notes, issue commands:
  - Pause: `DBG:{"op":"pause"}`
  - Eval: `DBG:{"op":"eval","args":{"expr":"2+2"}}`
  - Breakpoint: `DBG:{"op":"breakpoint","args":{"file":"src/foo.ts","line":42}}`
- The app responds with `DBG-OK: ...` or `DBG-ERR: ...` directly to the Manager stream.

## Monitor and Remote Control

- Enable `[monitor]` to detect stalls/danger and interrupt. This is the default in config.
- `[remote_monitor]` is planned to relay via SoftOboros infrastructure; an account will be required. Local monitor remains the default.
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
  - "Launch: mis (ts-node) — interactive debug" (gives the child a real TTY; best for CLIs that probe the terminal).
  - "Launch: mis (ts-node) — non-interactive debug" (passes child flags like `-y --no-color --no-tty` to suppress prompts/TTY usage).
  - "Launch: mis (ts-node) — debug verbose" (maximum readable diagnostics with clean logs).
  - "Launch: mis (dist)" and "Launch: mis (dist) — no debug".
  - "Attach: Node (9229)" or "Attach: Pick Node Process" to attach to an inspector‑enabled node.

## Contact

- Email: ira@softoboros.com

## Security Notes

- Redaction is on by default; telemetry is local and opt‑in.
- Favor short‑lived credentials and least‑privilege access in your environment.
