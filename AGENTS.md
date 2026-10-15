# AGENTS.md

## Project

- Node.js 22 ESM backend for the Globalping dashboard, built as a pnpm workspace of Directus extensions. Directus and MariaDB run in Docker.
- Edit `src/extensions/`, not generated `dist/` or root `extensions/` files. Shared helpers live in `src/extensions/lib/src/`.
- See [README.md](README.md) for setup and schema/migration commands. Seeding resets local application data and non-admin users.

## Local Development

Use email/password login directly in [Directus](http://localhost:18055). Use the regular account for normal development.

| Account | Email | Password |
| --- | --- | --- |
| Regular user with test data | `user@example.com` | `user` |
| Fresh user | `newuser@example.com` | `newuser` |
| Admin | `admin@example.com` | `password` |

- Rebuild Directus after extension changes: `docker compose up --build -d directus`. Restart it after schema changes.
- Keep actual secrets and generated tokens in ignored `.env.*` files.

## Worktrees

- Use `.worktrees/` and create the ignored development environment files in each worktree.
- Compose names and host ports are hard-coded. For concurrent stacks, use unique names and ports in the worktree's Compose files and matching URLs/ports in its environment files. Keep container DB ports unchanged and local isolation edits out of commits.
- Initialization and E2E scripts explicitly select Compose files; E2E also hard-codes ports in its test setup. Stop the worktree's stacks when finished.

## Code Conventions

- Use tabs in code, spaces in Markdown/YAML, and explicit `.js` extensions in relative TypeScript imports.
- Use the Directus context logger in runtime extensions, and preserve accountability and permission checks.
- Prefer Directus APIs, existing dependencies, and shared helpers over new abstractions. Keep changes scoped.
- Await required async work and handle rejections for intentional fire-and-forget work.
- Follow existing database field names. Add new dated migrations in `src/extensions/migrations/` instead of changing applied migrations; keep `snapshots/collections-schema.yml` consistent with schema changes.
- When adding/removing extension packages, update the Dockerfile manifest list with `pnpm run docker:ls:update`.

## Verification

- For code changes, run sequentially: `pnpm run lint`, `pnpm test`, `pnpm -r build`.
- Use `pnpm --filter <extension-name> test` and `build` for focused checks. Shared-helper changes require checking affected consumers. Use `test`, not `test:dev`, for verification so TypeScript checking runs.
- Set `MOCHA_OPTIONS="--reporter=min"` unless passing-test details are needed.
- Update tests for already-tested behavior; do not add tests to existing untested code unless asked. Test behavior and restore mocks.
- Run `pnpm run test:e2e` for dashboard/backend integration changes or when requested. It requires Docker, E2E environment files, and Playwright Chromium. Its frontend build resets `test/e2e/globalping-dash/`; preserve frontend work elsewhere.
- State which checks ran. Documentation-only changes do not require application tests.
