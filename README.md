<div align="center">
  <img src="placeholder.png" alt="makeitso-codex" width="720" />
  <h1>makeitso-codex</h1>
  <p><em>A Picard‑style bridge command for your Codex engineering department: “make it so.”</em></p>
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
```

## Why

Codex is a superb <em>worker</em>. This package adds a <strong>Manager</strong> that turns a bridge command (“make it so”) into a concrete plan, runs Codex workers, parses their delimited output, and self‑tunes the parser via a feedback loop.

See <a href="./PLAN.md">PLAN.md</a> for the architecture and test strategy.

## Security Notes

- Provide `CODEX_API_KEY` via environment/OS keychain; never commit secrets.
- Account login flow uses device-code or browser handoff; tokens are short‑lived.
- Redaction is on by default; telemetry is local and opt‑in.

