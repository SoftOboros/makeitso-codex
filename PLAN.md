# makeitso-codex — Plan & Test Strategy

**Tagline:** _A Picard‑style bridge command for your Codex engineering department: “make it so.”_

## 0) Context pulled from "LinkedIn Job applications" thread
- **Orchestrator & protocol:** Orchestrator maintains a **dictionary of phrases** (in `AGENTS.md`) that defines a compact protocol/language for coordination.
- **Delimited IO:** Workers (Codex CLI) emit **STDERR/STDOUT with delimiters** for machine parsing.
- **Self‑tuning parsing:** Codex can be tasked to **improve the regex set** that parses its own output and logs.
- **Manager vs Worker:** Codex is tuned as a **worker**. A **Manager** provides high‑level context and approvals, reducing the need to run fully unattended. Manager can be Codex or another model.
- **Department agent:** This forms a **department‑level agent** (Engineering) coordinating specialists.
- **Ouroboros loop:** The **Softoboros** approach uses Codex to generate/execute and then use the results to improve itself — a **constructive feedback loop**.

## 1) Goals & Non‑Goals
**Goals**
- Provide a **TypeScript (npm)** package that orchestrates Codex CLI tasks via a bridge‑like **Manager** issuing “make it so” intents to engineering **Workers** (Codex).
- Support **two auth modes**: (a) Codex **API** key; (b) **Account** login (user‑interactive) — both with safe handling of sensitive data.
- Ship a **self‑tuning feedback loop** to harden parsing (regex/model prompts) and task policies.
- Mirror **Codex config ergonomics** with a `config.toml` that also configures the **Manager**.
- Provide **approval levels**: micromanage (Picard in the Jeffries tube) ↔ delegate (bridge order).

**Non‑Goals**
- Replacing Codex CLI features; this orchestrates them.
- Long‑term credential storage beyond ephemeral/session or OS keychain (no plaintext secrets in repo/logs).

## 2) High‑Level Architecture
- **Orchestrator (Bridge):**
  - Loads `AGENTS.md` protocol dictionary (intents, phases, control tokens, delimiter spec).
  - Converts a user “bridge command” (e.g., `makeitso`) into a **Plan** (tasks, workers, policies).
  - Manages approvals, budgets, and telemetry.
- **Manager (Captain):**
  - **Option A:** `manager: codex` — Codex acts as the manager using a higher‑level prompt/policy.
  - **Option B:** `manager: api:<model>` — an assigned API model (e.g., GPT‑5‑Instant/Thinking) acts as manager.
  - Responsibilities: decomposition, guardrails, stop/continue decisions, post‑run learning signals.
- **Workers (Engineering / Codex instances):**
  - Execute atomic tasks via Codex CLI/API.
  - Emit **delimited** structured logs for machine parsing.
- **Parser & Knowledge:**
  - **Regex library** for log/trace extraction; 
  - LLM‑aided **regex proposer** + test harness; 
  - Optional vector index for artifacts/notes.
- **Feedback Loop (Ouroboros):**
  1. Run → collect delimited logs/artifacts.
  2. Parse → detect misses/drift.
  3. Propose fixes (LLM) → candidate regex/prompt tweaks.
  4. Validate on replay suite.
  5. Gate (human/auto) → version.

## 3) Auth & Secrets
- **API mode:** `CODEX_API_KEY` from env/secret manager. Never print keys. Mask in logs.
- **Account mode:** Device‑code or browser handoff; cache short‑lived tokens in OS keychain or memory.
- **Policy:** Sensitive data never committed; redact in telemetry; optional “air‑gap” mode (no external writes).

## 4) Configuration (`config.toml`)
Mimics Codex, adds **manager** block. Example:
```toml
[project]
name = "acme"
root = "./"
artifacts_dir = ".makeitso/artifacts"

[manager]
# "codex" to have Codex act as manager; or "api:<model>" to use an assigned model via API
kind = "api:gpt-5-instant"  # or "codex"
approval = "delegate"       # "manual" | "confirm-phase" | "delegate"
budget_tokens = 500000
max_concurrency = 2

[workers.codex]
run_via = "cli"              # "cli" | "api"
profile = "default"
delimiters = { start = "<<MIS:START>>", end = "<<MIS:END>>" }

[policies]
write_files = "ask"          # "never" | "ask" | "auto"
run_shell = "ask"
network = "ask"

[telemetry]
enabled = true
redact = true
store = "local"              # "local" | "none"

[learning]
mode = "shadow"              # "off" | "shadow" | "canary" | "auto"
regex_repo = "./protocol/regexes.toml"
prompt_repo = "./protocol/prompts/"
replay_dir = ".makeitso/replays"
```

### `AGENTS.md` (protocol dictionary — excerpt)
- **Intents:** `PLAN`, `EXEC`, `EVAL`, `FIX`, `LEARN`.
- **Phases:** `bootstrap`, `task`, `verify`, `summarize`.
- **Control tokens:** `<<MIS:START>>`, `<<MIS:END>>`, `<<MIS:ERR>>`, `<<MIS:JSON>>`.
- **Style rules:** terse, structured JSON on request, no ANSI unless requested, etc.

## 5) Development Plan (Epics → Tasks)
### EPIC A — Scaffolding & CI
- A1: Create TS package skeleton (`src/`, `bin/`, `types/`, ESM or CJS, strict).
- A2: `package.json` commands: `build`, `lint`, `test`, `e2e`, `audit`.
- A3: Basic CLI `mis` with subcommands (see §8).
- A4: GitHub Actions: Node LTS matrix, `npm publish --dry-run`, provenance, audit.

### EPIC B — Orchestrator & Manager
- B1: Types: `Plan`, `Task`, `Phase`, `ApprovalPolicy`, `Budget`.
- B2: Manager adapters: **Codex-as-Manager** and **API‑Model Manager**.
- B3: Approval flows: `manual`, `confirm-phase`, `delegate` with overrides.
- B4: Budget/token accounting; per‑phase ceilings; stop‑on‑exceed.

### EPIC C — Worker (Codex) Integration
- C1: CLI runner with **delimited** capture of STDOUT/STDERR.
- C2: API runner with identical contract; pluggable profiles.
- C3: Artifact capture: files, patches, summaries.
- C4: Sandbox policy (write/run/net) mediation.

### EPIC D — Parser & Self‑Tuning
- D1: Regex library v1 (`protocol/regexes.toml`).
- D2: Parser engine → structured records (events, artifacts, metrics).
- D3: **Regex Proposer:** prompt Codex/Manager to suggest improved patterns from failures.
- D4: Replay & validation harness; score improvements; maintain **shadow/canary** modes.
- D5: Auto‑merge thresholds + **human gate** for risky rules.

### EPIC E — Config, Protocol, Docs
- E1: `config.toml` loader + schema validation (zod or internal).
- E2: `AGENTS.md` baseline with intents/phrases & delimiter spec.
- E3: README, quickstart, examples.

### EPIC F — Security & Compliance
- F1: Secret sourcing (env/OS keychain). No plaintext in logs.
- F2: Redaction filter; PII/secret detectors; test cases.
- F3: Opt‑in telemetry with schema + redaction.

### EPIC G — Testing & Bench
- G1: **Unit** tests (parsers, plans, config, budgets, approvals).
- G2: **Integration** tests against local Codex CLI (stubbed and real) with delimited IO.
- G3: **E2E** scenarios: "apply patch", "generate tests", "fix build", "refine regexes".
- G4: **Replay suite** for learning validation; golden logs.
- G5: Performance baseline; token & latency budgets; concurrency.

## 6) CLI Surface (initial)
- `mis init` → scaffold config & `AGENTS.md`.
- `mis plan <goal>` → show Manager‑generated plan (no execution).
- `mis run <goal>` → execute with current approval policy.
- `mis audit` → show telemetry, budgets, drift alerts.
- `mis learn` → run learning pass on latest runs (shadow/canary/auto).
- `mis approve <change>` → accept proposed regex/prompt changes.

## 7) Core Types (TS sketch)
```ts
export type ApprovalPolicy = "manual" | "confirm-phase" | "delegate";
export type ManagerKind = { kind: "codex" } | { kind: "api", model: string };

export interface Plan { id: string; tasks: Task[]; budgetTokens: number; }
export interface Task { id: string; goal: string; phases: Phase[]; }
export interface Phase { name: string; approval: ApprovalPolicy; }

export interface RunOptions {
  manager: ManagerKind; policy: ApprovalPolicy; budgetTokens: number;
}

export interface Delimiters { start: string; end: string; err?: string; json?: string; }
```

## 8) Parsing & Learning Flow (detail)
1. **Capture:** Workers emit with `<<MIS:START>> ... <<MIS:END>>` blocks.
2. **Parse:** Regex library extracts `{phase,event,artifact,json}`; classify misses.
3. **Propose:** Manager generates improved regex/prompt deltas with rationale.
4. **Validate:** Run on **replay logs**; compute precision/recall & drift.
5. **Gate:** If thresholds met and policy allows → update `protocol/regexes.toml`; else require `mis approve`.

## 9) Example: Regex Library Entry
```toml
[[pattern]]
name = "json_block"
intent = "extract-json"
regex = "<<MIS:JSON>>(.*?)<<MIS:END>>"
multiline = true
reflags = ["s"]
```

## 10) Approval & Micromanagement
- **Picard mode:** `approval = manual` → step every phase with diffs.
- **Department mode:** `approval = delegate` → auto unless policy boundary crossed.
- **Hot override:** `mis run --halt-on write_files,run_shell` to pause on risky ops.

## 11) Testing Strategy
- **Golden log fixtures** (success, partial, failure, noisy ANSI, truncated).
- **Fuzzed outputs** to harden regexes.
- **Shadow learning** always on in CI → propose but don’t merge.
- **Canary**: enable new regexes for 10% of runs; monitor regressions.
- **Determinism:** Snapshot tests for plans; stable seeds for prompts.

## 12) Telemetry & Metrics
- Parse success rate, extraction coverage, plan adherence, token usage, latency, approval counts.
- Redacted traces for debugging; local storage by default.

## 13) Directory Layout
```
makeitso-codex/
  bin/mis.ts
  src/{orchestrator,manager,worker,parser,config}/
  protocol/{AGENTS.md,regexes.toml,prompts/}
  .makeitso/{artifacts,replays}/ (gitignored)
  examples/
  tests/{unit,integration,e2e,replay}/
```

## 14) Rollout
- **v0.1.0**: Orchestrator + Manager (codex/api), Worker (cli), delimited parsing, manual & delegate approvals, basic learning (shadow).
- **v0.2.x**: API worker, canary learning, richer telemetry, OS keychain tokens.
- **v0.3.x**: Plugins (skills), vector memory, multi‑repo orchestration.


## 14.1) Implemented Since Initial Draft
- Console stream mirroring with Codex‑style coloring and a dedicated “manager notes” stream.
- Monitor agent: observes all streams, detects stalls/danger, and interrupts manager/worker when needed.
- Remote monitor (WebSocket) hook with HMAC signing and remote control commands (set stall timeout, add/clear danger).
- Non‑blocking wait scheduler and manager policy to avoid token‑burning waits; pre‑task wait support.
- Sandbox policy enforcer for `run_shell`, `network`, and `write_files` (auto/ask/never) across CLI, remote, and artifacts.
- Telemetry events (schema + metrics): run start/end, phase actions, waits, interrupts, bytes and durations; audit summarizes stats.
- Regex proposer + approval flow: proposals to TOML with rationale; `mis approve <file>` to apply.
- API worker plumbing with network gating, env‑based key sourcing; stubbed streaming when unavailable.
- Secrets + redaction: global redactor fed from configured env vars; applied to notes and telemetry.
- Debug bridge:
  - Driver abstraction and router parsing `DBG:{...}` commands from manager notes.
  - Node Inspector driver (CDP over WebSocket) for pause/resume/breakpoint/eval.
  - DGDB driver placeholder for embedded/gdb workflows.
  - Orchestrator wiring with network policy gate; driver selection via config or `MIS_DEBUG_DRIVER`; inspector URL via config or `--inspect-url`.
- Developer UX:
  - VS Code launch configs for CLI/tests; attach support.
  - `mis open <url>` with container‑safe printing or configurable command/open.
  - CI matrix (Node 18/20/22) and publish dry‑run.


## 15) Risks & Mitigations
- **Regex brittleness:** Shadow→canary→gated merges; LLM‑proposed diffs with tests.
- **Secret leakage:** Mandatory redaction; “never log secrets”; CI checks.
- **Approval fatigue:** `confirm-phase` default; budget ceilings; summaries.
- **Model drift:** Replay suite; pinned prompts; periodic audits.

---
**Ready next steps:** A1, B1–B2, C1, D1, E1 with `mis init` minimal flow and a trio of golden logs to seed the learning loop.

---
## 16) Checklist

- [x] Console stream mirroring + manager notes
- [x] Monitor agent with stall/danger interrupts
- [x] Remote monitor WS + HMAC + control
- [x] Non‑blocking wait scheduler and policy
- [x] Sandbox policy mediation (shell/net/write)
- [x] Telemetry schema + audit metrics
- [x] Regex proposer + approval flow
- [x] API worker (gated; stub fallback)
- [x] Secrets sourcing + redaction
- [x] Debug driver abstraction + router
- [x] Node Inspector driver (pause/resume/breakpoint/eval)
- [x] Orchestrator debug wiring + CLI `--inspect-url`
- [x] DGDB driver placeholder
- [x] VS Code debug configs (CLI/tests)
- [x] `mis open <url>` with print/command/auto
- [x] CI matrix + publish dry‑run
- [ ] DGDB protocol implementation (pause/step/stack)
- [ ] Manager API credentials wired for `api:*` kinds
- [ ] End‑to‑end debug demo with inspector
- [ ] Performance benchmarks and budgets

---
## 17) GitHub Pages / Demo Site (Planned)

- Goal: Provide a simple, public landing that mirrors README highlights and quickstart.
- Approach:
  - Maintain a minimal `index.html` in the repo root (no build system required).
  - Optionally experiment (later) with a compiled TypeScript site that pulls content at build time.
  - Consider Git LFS or pre-signed S3 links for large assets; keep repo lean.
  - Avoid Jekyll processing quirks by adding `.nojekyll` if needed.
  - Keep secrets out of docs and pages; no dynamic secret references.
- Rollout:
  1. Manual `index.html` (done) with hero image and quickstart.
  2. Future: demo repo mode — generate static HTML from compiled TS, publish via GitHub Pages.
  3. Optional: link a “live logs” view backed by artifacts (local only by default).
