# Command Workflow Details

This guide explains each `mis` command in depth with examples, tips, and notes on policies and telemetry.

## mis init
Scaffolds config and protocol files in the current project.

- Creates `config.toml` if missing (based on examples/config.example.toml).
- Copies protocol baseline files into `./protocol/` (AGENTS.md, regexes.toml).
- Does not overwrite existing files.

Example:
```bash
npx mis init
```

Suggested initial bounding prompt for your first plans:
- Keep changes minimal and reversible (small patches).
- Never print or store secrets; redact sensitive values.
- Avoid token-burn: if a wait is needed, schedule a local timer and resume.
- Ask for approval at phase transitions if risk is detected.
- Prefer PR-sized diffs; include tests when reasonable.

## mis plan <goal>
Generates a plan without running it. The plan decomposes the goal into phases and tasks and reflects the active approval policy.

Example:
```bash
npx mis plan "add eslint and fix ci failures"
```

Notes:
- Plan content depends on manager.kind (codex or api:<model>), budget, and policy.
- No changes are made to the workspace.

## mis run <goal>
Runs the goal with the current configuration and policies.

Examples:
```bash
# Local debug (verbose, readable logs)
npx mis --profile debug run "wire debug driver and add tests"

# Non-interactive with child CLI flags (no TTY probes)
npx mis --profile debug --child-args "-y --no-color --no-tty" run "update docs across modules"

# CI-style unattended (auto-approve, bounded iterations)
npx mis --dangerous-full-auto-self-driving-mode run "apply security patches and bump dependencies"
```

Behavior:
- Honors sandbox policies (shell, network, write_files). If set to `ask`, will prompt on risky actions.
- Saves replays to `.makeitso/replays/` and artifacts to the configured artifacts_dir.
- Emits telemetry events (run_start, phase, waits, interrupts, run_end) if enabled.
- Manager notes appear in console; debug commands in notes (`DBG:{...}`) route to the active debug driver when enabled.

Wizard mode:
- If you start `mis` without arguments, it will guide you through entering a goal and choosing an action (run or plan).

## mis bootstrap <goal> [BASE.md]
Seeds planning with BOOTSTRAP.md (or a custom base name) and then runs phases as normal.

Examples:
```bash
npx mis bootstrap "Add scheme X to backend and frontend" BOOTSTRAP.md

# Mobile companion app seed (iOS/Android)
npx mis bootstrap "Bootstrap companion app UIs and API client" BOOTSTRAP.md

# Write the generated plan file before running
MIS_WRITE_PLAN=1 npx mis bootstrap "Refactor routing and add tests" BOOTSTRAP.md
```

Behavior:
- Reads the bootstrap doc and includes it in the manager’s planning prompt, alongside a truncated repository summary and recent thread summary.
- Prints the generated plan JSON before approvals.
- Continues with phases under your approval and profile settings.

## mis profile
Shows the active runtime profile and effective settings used for the current environment.

Example:
```bash
npx mis profile
```

Output:
```
Active profile: dev
Workers.codex: stdin_only=on, interactive=off, plain=on, timeout_ms=15000
Logging: verbose=off, inplace=off
```

Notes:
- Profile selection order: `--profile` → `[ui].profile` → auto (CI→ci, debugger/verbose→debug, else dev).

## mis audit
Summarizes recent activity from replays/artifacts and telemetry.

Example:
```bash
npx mis audit
```

Output includes:
- Replay and artifact counts and sizes.
- Event summary from telemetry (runs, waits, interrupts, averages) if enabled.
- Latest run timestamp, artifact count, and detected goal.

## mis learn
Analyzes replay logs, reports coverage against the regex library, and proposes improvements.

Example:
```bash
npx mis learn
# If a proposal is generated:
# Proposal: regex improvements suggested:
#   - Added 'g' flag to json_block ...
# Approve via: npx mis approve .makeitso/proposals/regex_XXXXXXXX.toml
```

Notes:
- Coverage is based on patterns like `json_block`, `error_block`, and `start_end_block`.
- Proposals are saved in `.makeitso/proposals/` and require explicit approval.

## mis approve <file>
Applies a proposal (e.g., regex TOML) to your local protocol library.

Example:
```bash
npx mis approve .makeitso/proposals/regex_1699999999999.toml
```

Behavior:
- Backs up the current `protocol/regexes.toml` to a `.bak.<timestamp>` file.
- Copies the proposal over `protocol/regexes.toml`.

## mis open <url>
Opens or prints a URL, depending on `[ui]` config and sandbox policies.

Examples:
```bash
npx mis open https://example.com
# With [ui] open_url = "print" (containers/headless), prints the URL.
# With open_url = "auto", attempts to use the platform opener (open/xdg-open/start).
# With open_url = "command", runs your configured command (e.g., curl -I {url}).
```

Notes:
- `run_shell` policy applies; if set to `ask`, you may be prompted.

---

## Debug Commands in Manager Notes
When `[debug]` is enabled, the Manager can emit debug commands in its notes. The app routes these to the active driver and echoes responses back.

Examples:
```text
DBG:{"op":"pause"}
DBG:{"op":"eval","args":{"expr":"2+2"}}
DBG:{"op":"breakpoint","args":{"file":"src/foo.ts","line":42}}
DBG:{"op":"step"}
DBG:{"op":"stack"}
```

Responses:
- `DBG-OK: {...}` on success
- `DBG-ERR: reason` for errors (invalid JSON, no driver, unsupported op)

Drivers:
- Node inspector (CDP over WebSocket): pause/resume/breakpoint/eval
- DGDB (MI over TCP): pause/step/stack (early support)

Remote relay (planned):
- A remote monitor/relay will be available via SoftOboros (account required). Local monitor remains the default.

---

## Policies and Telemetry
- Policies gate shell, network, and writes with `auto`, `ask`, or `never`.
- Telemetry stores JSONL events in `.makeitso/telemetry/` and is summarized by `mis audit`.

---

## Profiles and Global Flags

Profiles set defaults for child I/O and logging:

- `dev`: stdin_only=on, interactive=off, plain=on, timeout≈15s
- `debug`: same as dev + verbose diagnostics
- `ci`: stdin_only=off, interactive=off, plain=on, timeout≈60s

Global flags:
- `--profile dev|debug|ci`: select runtime profile (overrides `[ui].profile`)
- `--non-interactive`/`-y`: auto-approve where allowed
- `--force-stub`: force stubbed Codex worker
- `--inspect-url <ws://..>`: override debug inspector endpoint
- `--codex-key <token>`: set env for `workers.codex.api_key_env` (fallback `CODEX_API_KEY`)
- `--child-arg <tok>` / `--child-args "..."`: extra flags for the child CLI before the goal (e.g., `-y --no-color`)
- `--dangerous-full-auto-self-driving-mode`: CI-like full auto (auto-approve, CI profile, bounded auto-iterations)
- `--write-plan`: write generated plan JSON to `.makeitso/plan_<timestamp>.json` (applies to plan, plan-bootstrap, and run)

### Real‑world examples

```bash
# 1) Full auto on CI: end-to-end with guardrails
OPENAI_API_KEY=sk-... \
mis --dangerous-full-auto-self-driving-mode \
    --cwd /srv/repo \
    run "Create a plan and execute to incorporate scheme X into backend and frontend, wire them together, and create tests"

# 2) Interactive local debugging: child gets a real TTY (best for CLIs with spinners/DSR)
MIS_CHILD_INTERACTIVE=1 \
mis --profile debug --cwd ~/code/repo \
    run "Investigate failing integration tests and fix mocks"

# 3) Non-interactive local debugging: clean logs, captured output
mis --profile debug --child-args "-y --no-color --no-tty" --cwd ~/code/repo \
    run "Update docs, regenerate API clients, and lint"

# 4) Plan-only bootstrap preview, then commit plan to artifacts
MIS_WRITE_PLAN=1 \
mis plan-bootstrap "Bootstrap companion apps and align terminology" BOOTSTRAP.md
```

## mis plan-bootstrap <goal> [BASE.md]
Seeds planning from a bootstrap doc and prints the plan JSON without executing phases.

Examples:
```bash
npx mis plan-bootstrap "Add scheme X to backend and frontend" BOOTSTRAP.md

# Plan-only preview for a frontend build-out
MIS_WRITE_PLAN=1 npx mis plan-bootstrap "Create SwiftUI/Compose companions using existing API" FRONTEND_BOOTSTRAP.md
```

Behavior:
- Reads the bootstrap doc, repository summary, and recent thread summary into the planning prompt.
- Prints the generated plan JSON. Combine with `--write-plan` to persist.
