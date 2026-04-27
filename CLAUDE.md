# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (no build required)
npm run dev              # Run server with tsx
npm run dev:debug        # With DEBUG=auth0-mcp
npm run dev:inspect      # With MCP inspector UI

# Build
npm run build            # format + lint + tsc (output: dist/)
npm run typecheck        # Type-check without emit

# Lint & Format
npm run lint             # ESLint check
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Prettier write
npm run format:check     # Prettier check

# Tests
npm test                 # Full test suite (single run)
npm run test:watch       # Watch mode
npm run test:coverage    # With V8 coverage report

# Run a single test file
npx vitest run test/tools/applications.test.ts

# Run tests matching a pattern
npx vitest run -t "should list applications"
```

## Architecture

This is an MCP (Model Context Protocol) server that bridges AI assistants (Claude Desktop, Cursor, etc.) to the Auth0 Management API via stdio transport.

### Request Flow

```
AI Assistant (stdio) → MCP Server (server.ts) → Tool Handler (tools/) → Auth0 Management API
```

The server validates credentials at three layers: CLI startup (`commands/run.ts`), server initialization (`server.ts`), and on every individual tool call (token expiration check).

### Key Source Directories

- **`src/commands/`** — Four CLI commands: `init` (authenticate + configure AI client), `run` (start MCP server), `session` (show auth status), `logout` (clear keychain)
- **`src/tools/`** — One file per Auth0 domain (applications, resource-servers, actions, logs, forms, application-grants). Each exports `DOMAIN_TOOLS` (definitions) and `DOMAIN_HANDLERS` (handlers). `tools/index.ts` aggregates them and wraps all handlers with analytics + response masking.
- **`src/auth/`** — Two auth flows: device authorization (browser-based, default) and client credentials (M2M, for private cloud)
- **`src/clients/`** — Per-AI-client configuration writers (Claude Desktop, Cursor, Windsurf, VS Code, Gemini) that update their respective MCP config files
- **`src/utils/`** — Shared utilities; notably `response-masker.ts` (strips secrets), `analytics.ts` (anonymous tracking, opt-out via `AUTH0_MCP_ANALYTICS=false`), `keychain.ts` (credential storage)

### Tool Definition Pattern

Every tool follows this structure:

```typescript
{
  name: 'auth0_verb_noun',
  description: '...',
  inputSchema: { type: 'object', properties: {...} },
  _meta: {
    requiredScopes: ['read:clients'],  // Auth0 Management API scopes
    readOnly: true                      // Whether the tool mutates state
  },
  annotations: {
    title: '...',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
}
```

Handlers receive `{ token, domain, parameters }` and return `{ content: [{type:'text', text:'...'}], isError: boolean }`.

**Validation Checklist:**
- Tool name: `auth0_verb_noun` format (lowercase, snake_case)
- All handlers call `maskSensitiveFields()` before returning
- Required scopes match Auth0 Management API documentation
- Destructive tools set `destructiveHint: true` and `readOnly: false`
- Read-only tools set `readOnlyHint: true` and `readOnly: true`
- Input schema parameters align with Auth0 API naming

See `.claude/rules/tool-domain-development.md` for complete checklist.

### Environment & Configuration

**Debug Logging:**
```bash
DEBUG=auth0-mcp npm run dev
```
Enables debug output via the `debug` package. Shows token checks, API calls, masking events, and errors.

**Analytics:**
- Anonymous usage tracking (tool calls, success/failure) is enabled by default
- No personal identifiable information (PII) is collected
- **Opt-out:** Set `AUTH0_MCP_ANALYTICS=false` to disable
  ```bash
  export AUTH0_MCP_ANALYTICS=false
  npm run dev
  ```

### Authentication & Secrets

**Token Lifecycle:**
- Tokens and domain are stored in the OS keychain via `keytar` (`src/utils/keychain.ts`)
- The device flow uses Auth0's own tenant (`auth0.auth0.com`) as the authorization server
- Tokens are JWT-decoded for expiry checks; no automatic refresh on expiration
- If token expires, the server returns an MCP error; user must run `auth0-mcp-server init` or `auth0-mcp-server run` to re-authenticate
- On headless/CI systems without keychain access, tokens can be passed via environment variable as a fallback

**Response Masking (Security):**
- `src/utils/response-masker.ts` strips secrets from API responses before returning to MCP client
- **Every handler must call `maskSensitiveFields()`** on responses (see `.claude/rules/response-masking-audit.md`)
- Masked fields: `client_secret`, `signing_keys`, `encryption_key`, `signing_key`, `private_key`, `refresh_token`
- Deep-dive documentation: `docs/response-masking.md`

**Tool Access Control:**
- Tool access is filtered by glob patterns (`--tools` flag) and `--read-only` mode via `src/utils/tools.ts`

### Testing Conventions

- Tests live in `test/`, mirroring `src/` structure
- HTTP calls are intercepted by MSW (Mock Service Worker) globally
- MSW server initialized in `test/setup.ts` — **do NOT import or initialize MSW in individual test files**
- Mock HTTP handlers: `test/mocks/handlers.ts` (intercepts HTTP requests)
- Mock data fixtures: `test/mocks/auth0/{domain}/` (response data)
- Response masking must be verified in tests (check `[REDACTED]` appears for sensitive fields)
- Coverage excludes `src/utils/` by design (see `vitest.config.ts`)

### Adding a New Tool Domain

To add a new Auth0 API domain (e.g., webhooks, rules, users):

1. Create `src/tools/my-domain.ts` with `MY_DOMAIN_TOOLS` and `MY_DOMAIN_HANDLERS`
2. Import and aggregate in `src/tools/index.ts` (add to `TOOLS` and `allHandlers`)
3. Add mock HTTP handlers in `test/mocks/handlers.ts`
4. Create mock data fixtures in `test/mocks/auth0/{domain}/`
5. Create test suite in `test/tools/my-domain.test.ts` (verify masking)
6. Run `npm test` to validate

**Full walkthrough:** See `docs/adding-a-new-tool-domain.md`
