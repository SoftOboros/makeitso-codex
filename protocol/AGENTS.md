# AGENTS Protocol (makeitso-codex)

## Intents
- `PLAN` — decompose user goal into tasks/phases
- `EXEC` — perform an atomic step
- `EVAL` — evaluate results vs. goal
- `FIX`  — propose remediation
- `LEARN`— propose parser/prompt improvements

## Phases
`bootstrap` → `task` → `verify` → `summarize`

## Delimiters
- Start: `<<MIS:START>>`
- End: `<<MIS:END>>`
- JSON: `<<MIS:JSON>>`
- Error: `<<MIS:ERR>>`

Emit structured JSON blocks on request between `<<MIS:JSON>>` and `<<MIS:END>>`.

## Style
- Be terse. Prefer JSON over prose when asked.
- Avoid ANSI escapes unless explicitly requested.
- Do not print secrets or tokens.
