# Contributing to makeitso-codex

Thanks for your interest in contributing! This repo aims to keep changes focused and safe.

- Use Node 18+.
- Run `npm i` then `npm run build`.
- Add tests where practical (see tests/). Keep PRs scoped.
- Follow the existing code style; run `npm run lint` before submitting.
- Avoid adding secrets to code, docs, or logs. Keep credentials in env.
- Do not introduce breaking changes without discussion.

## Development tips
- `npx mis init` to scaffold config locally.
- `npm run dev` to run the CLI via ts-node for quick iteration.
- `npm test` runs unit tests (simple harness in tests/run.ts).

## Commit and PR guidelines
- Clear title and description; link to issues if relevant.
- Small, reviewable changes are easier to land.
- CI must be green.

## License
This project is MIT licensed. By contributing, you agree your contributions are licensed under the same.
