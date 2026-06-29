# AGENTS.md

This file provides guidance to AI coding agents working with this repository.

## What This Is

An MCP (Model Context Protocol) server that lets AI assistants interact with the Auth0 Management API. It exposes Auth0 operations as "tools" an LLM can call.

## Commands

```bash
npm run dev              # Run with tsx (no build needed)
npm run build            # Compile TypeScript → dist/ (runs format + lint first)
npm run typecheck        # Type check without emitting
npm run test             # Run vitest once
npx vitest run test/tools/applications.test.ts  # Single test file
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier format
```

## Architecture

**Request path:** `src/server.ts` validates each tool call (token expiry, rejects undeclared parameters) → `src/tools/index.ts` dispatches to domain handler → handler calls Auth0 API → `src/utils/response-masker.ts` redacts secrets before the response reaches the LLM.

**Key directories:**

- `src/tools/` — one file per domain (applications, actions, logs, forms, etc.). Each exports tool definitions and handlers.
- `src/auth/` — two flows: `device-auth-flow.ts` (browser OAuth2, primary) and `client-credentials-flow.ts` (M2M for private cloud).
- `src/clients/` — per-client config managers (Claude, Cursor, Windsurf, VS Code, Gemini) that write MCP config into each tool's config file.
- `src/commands/` — CLI commands: `init` (auth), `run` (start server), `logout`, `session`.
- `src/utils/` — shared utilities; notable: `config.ts` (credential loading), `tools.ts` (filtering logic), `response-masker.ts`.

## Tool System

Tools are named `auth0_<verb>_<resource>` (e.g. `auth0_create_application`, `auth0_list_logs`). Read operations carry `readOnly: true` in `_meta`.

To add a tool: define it in `src/tools/<domain>.ts`, add the handler, register both in `src/tools/index.ts`.

Tools are filtered at startup by glob patterns (`--tools` / `AUTH0_MCP_TOOLS`) and a read-only flag (`--read-only` / `AUTH0_MCP_READ_ONLY=true`). Read-only takes priority over patterns.

## Non-Obvious Behaviors

- **Undeclared parameter rejection** (`src/server.ts`): tool calls with parameters outside the schema are rejected — this is a prompt injection defense, not a bug.
- **Config priority**: env vars override CLI flags, which override defaults.
- **No default scopes**: zero Auth0 scopes are granted unless the user explicitly selects them during `init`.
- **Three token checkpoints**: token expiry is validated at startup, server init, and per tool call.

## Testing

Tests in `test/` mirror `src/` structure. Uses Vitest + MSW for API mocking.

## Code Style

Enforced by Prettier + ESLint (`npm run build` runs both before compiling).

- **Variables**: `const` by default; `let` only when reassignment is needed; no `var`.
- **Equality**: always `===`, never `==`.
- **Strings**: template literals over concatenation.
- **Logging**: No `console.*` — use the logger utilities or remove before committing.
- **`ts-ignore`**: allowed only with a description of ≥ 10 characters.
- **Non-null assertions (`!`)**: avoid; prefer an explicit null-check or guard.

## Checklist

Before marking a task complete, verify:

- [ ] `npm run typecheck` passes — no type errors.
- [ ] `npm run test` passes — all tests green.
- [ ] `npm run lint:fix` leaves no errors (warnings tolerated where unavoidable).
- [ ] `npm run format` produces no diff (or was already run).
- [ ] New tool: defined in `src/tools/<domain>.ts`, handler added, both registered in `src/tools/index.ts`.
- [ ] Any new secret-like fields are added to `src/utils/response-masker.ts`.
- [ ] No `console.log` / debug output left in production paths.
- [ ] No secrets, tokens, or credentials are logged or returned in tool responses — verify against `src/utils/response-masker.ts`.
- [ ] Tool schemas reject undeclared parameters (no extra fields allowed) — prompt injection defense.
- [ ] New parameters are validated at the boundary; never pass raw user input directly to Auth0 API calls.
- [ ] No new dependencies introduced without reviewing their supply-chain risk (`npm audit`).
