# AGENTS.md

## Project overview

This is the source code for the **Auth0 MCP Server** (`@auth0/auth0-mcp-server`) — a production npm package that gives AI assistants controlled access to Auth0 Management APIs via the Model Context Protocol.

## Architecture

```
src/
├── index.ts              # CLI entry (Commander) — commands: init, run, session, logout
├── server.ts             # MCP server setup, tool dispatch, token validation
├── commands/             # CLI command implementations
├── tools/                # MCP tool definitions + handlers (one file per domain)
│   ├── index.ts          # Registry — aggregates TOOLS[] and HANDLERS{}
│   ├── applications.ts   # Auth0 application CRUD
│   ├── actions.ts        # Auth0 Actions
│   ├── forms.ts          # Auth0 Forms
│   ├── logs.ts           # Tenant log queries
│   ├── resource-servers.ts
│   └── application-grants.ts
├── auth/                 # Device auth flow + client credentials flow
└── utils/                # Config, logger, types, keychain, response masking
test/
├── tools/                # Mirrors src/tools/ — one test file per tool file
├── mocks/                # MSW handlers + mock data
└── setup.ts              # MSW server bootstrap
```

## Dev environment

- Node.js >= 18, npm
- `npm install` to set up
- `npm run dev` — run locally with tsx
- `npm run dev:inspect` — run with MCP Inspector for interactive debugging
- `npm run dev:debug` — enables `auth0-mcp` debug namespace

## Build and test commands

- `npm run build` — typecheck + compile to `dist/`
- `npm test` — run tests (Vitest)
- `npm run test:watch` — watch mode
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm run typecheck` — TypeScript type checking only

## Testing instructions

Tests use Vitest with MSW for HTTP mocking. Pattern:

1. Define mock Auth0 Management API responses in `test/mocks/`
2. Call handler functions directly with mock `HandlerRequest` + `HandlerConfig`
3. Assert on the `HandlerResponse` structure (`content`, `isError`)

When adding a new tool, add a corresponding test file in `test/tools/` that covers success and error paths.

## Adding a new tool

Each file in `src/tools/` exports:
- `*_TOOLS: Tool[]` — MCP tool metadata (name, description, inputSchema, required scopes, annotations)
- `*_HANDLERS: Record<string, handler>` — async functions receiving `(request: HandlerRequest, config: HandlerConfig)`

Steps:
1. Create or extend a file in `src/tools/`
2. Define the tool with `inputSchema`, `_meta.requiredScopes`, and `annotations`
3. Implement the handler
4. Register both exports in `src/tools/index.ts`
5. Add tests in `test/tools/`

Every tool must include MCP annotations:
- `readOnlyHint` — true if read-only
- `destructiveHint` — true if it deletes or irreversibly modifies
- `idempotentHint` — true if repeated calls are safe
- `openWorldHint` — false (all ops scoped to the tenant)

## Code style

- TypeScript strict mode
- Prettier for formatting, ESLint for linting
- Run `npm run lint` and `npm run format` before committing
- Use `createSuccessResponse()` / `createErrorResponse()` from `src/utils/http-utility.ts` for tool return values
- Mask sensitive fields with `src/utils/response-masker.ts` — never expose raw tokens or secrets in responses

## Security considerations

- Tokens are stored in the system keychain (`src/utils/keychain.ts`), never in files
- The server validates tokens at startup and continuously during tool calls
- Every tool declares `_meta.requiredScopes` — the server filters available tools based on the token's granted scopes
- `--read-only` mode restricts to tools with `_meta.readOnly: true`
- Do not add tools that bypass scope enforcement or expose credentials

## Important constraints

- **Tool names are public API.** Names like `auth0_list_applications` are referenced by AI clients in prompts and configs. Do not rename without a migration path.
- **No breaking changes to inputSchema.** Adding optional fields is fine; removing or renaming required fields is not.
- **Response masking is mandatory.** Any handler returning data from the Management API must use `response-masker.ts` for fields containing secrets.
