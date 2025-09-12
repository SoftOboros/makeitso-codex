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

Example:
```bash
npx mis run "wire debug driver and add tests"
```

Behavior:
- Honors sandbox policies (shell, network, write_files). If set to `ask`, will prompt on risky actions.
- Saves replays to `.makeitso/replays/` and artifacts to the configured artifacts_dir.
- Emits telemetry events (run_start, phase, waits, interrupts, run_end) if enabled.
- Manager notes appear in console; debug commands in notes (`DBG:{...}`) route to the active debug driver when enabled.

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

---

## Policies and Telemetry
- Policies gate shell, network, and writes with `auto`, `ask`, or `never`.
- Telemetry stores JSONL events in `.makeitso/telemetry/` and is summarized by `mis audit`.

