# Repository Guidelines

## Project Structure & Module Organization
LangFlow is a multi-workspace repo:
- `src/backend/`: FastAPI service and CLI code (Python) under `src/backend/base/langflow/`.
- `src/frontend/`: Vite + React UI (`src/`) with static assets in `public/`.
- `src/lfx/`: agent toolkit under `src/lfx/src/`.
- Tests: `src/backend/tests/{unit,integration}` and `src/frontend/tests`.
- Docs and ops: `docs/`, plus scripts/containers in `scripts/`, `deploy/`, and `docker*`.

## Build, Test, and Development Commands
- `make init`: install backend deps (uv), frontend deps (npm), and pre-commit hooks.
- `make run_cli`: run LangFlow using the cached frontend bundle.
- `make run_clic`: rebuild frontend bundle, then run `uv run langflow run`.
- Backend-only: `uv run langflow run --frontend-path src/backend/base/langflow/frontend`.
- Frontend dev: `cd src/frontend && npm run dev`.
- Release build: `make build`.

## Coding Style & Naming Conventions
- Python (3.10+): 4-space indent, 120-char lines, `snake_case` for modules/functions, `PascalCase` for classes, env vars `ALL_CAPS`.
- Format/lint: `make format` (Ruff fix + format) and `make lint` (mypy).
- TypeScript/React: Biome formatting/linting (`cd src/frontend && npm run format`, `npm run lint`).
- File/layout conventions: React components `PascalCase.tsx`, UI directories `kebab-case/`.

## Testing Guidelines
- Backend: pytest via uv. Run `make unit_tests`, `make integration_tests`, or `make tests` (coverage).
- Frontend: `cd src/frontend && npm run test` / `npm run test:coverage`; E2E with `npx playwright test`.
- Prefer test file names like `test_<feature>.py` (e.g., `src/backend/tests/unit/test_flow_api.py`).

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (e.g., `feat(auth): add OTP (#123)`, `docs: update dev notes`).
- PRs: summarize intent, list impacted packages (`backend`, `frontend`, `lfx`), link relevant issues/docs, and attach screenshots/GIFs for UI changes. Include how to verify (commands + key output under `test-results/` when applicable).

## Security & Configuration Tips
- Keep API keys out of the repo; use env vars and local `.env` files.
- Avoid logging secrets; prefer redaction for request/response payloads.
