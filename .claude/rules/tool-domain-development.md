# Tool Domain Development Checklist

This rule enforces standards when adding new Auth0 tool domains to the MCP server.

**No paths frontmatter (unconditional — always loaded)**

## Before Adding a Domain

Verify you are extending an Auth0 API domain (e.g., applications, resource-servers, actions, logs, forms, application-grants, etc.).

## File Structure

1. Create `src/tools/{domain}.ts` with:
   - `DOMAIN_TOOLS: Tool[]` — array of tool definitions
   - `DOMAIN_HANDLERS: Record<string, HandlerFn>` — object mapping tool names to handler functions

## Tool Naming

- Format: `auth0_verb_noun` (e.g., `auth0_list_applications`, `auth0_get_application`, `auth0_create_application`)
- All lowercase, snake_case
- Semantic verb-noun pairs (`list`, `get`, `create`, `update`, `delete`, `rotate`, `enable`, `disable`)

## Tool Definition Structure

Every tool must include:

```typescript
{
  name: 'auth0_verb_noun',
  description: 'Human-readable description of what this tool does',
  inputSchema: { 
    type: 'object', 
    properties: { /* parameter definitions */ },
    required: [ /* required params */ ]
  },
  _meta: {
    requiredScopes: ['scope1', 'scope2'],  // Auth0 Management API OAuth scopes
    readOnly: true/false                    // true = does not mutate; false = creates/updates/deletes
  },
  annotations: {
    title: 'User-Friendly Tool Title',
    readOnlyHint: true/false,
    destructiveHint: true/false,           // true if tool deletes or irreversibly modifies
    idempotentHint: true/false,            // true if calling twice with same params has same effect
    openWorldHint: false                   // usually false for Auth0 tools
  }
}
```

## Handler Signature

```typescript
async (request: HandlerRequest, config: HandlerConfig): Promise<HandlerResponse>
```

Where:
- `request.token` — bearer token for Auth0 Management API
- `request.parameters` — user-provided input (already validated against inputSchema)
- `config.domain` — Auth0 tenant domain
- Response: `{ content: [{type: 'text', text: '...'}], isError: boolean }`

## Response Masking (Critical Security Requirement)

**Every handler must call `maskSensitiveFields()` before returning.**

```typescript
import { maskSensitiveFields } from '../utils/response-masker.js';

// Before returning:
const maskedResponse = maskSensitiveFields(apiResponse);
return createSuccessResponse(maskedResponse);
```

Masked fields by default: `client_secret`, `signing_keys`, `encryption_key`, `signing_key`, `private_key`, `refresh_token`.

## Test Fixtures

1. Create mock handlers in `test/mocks/handlers.ts`:
   - Add HTTP interceptors matching Auth0 Management API endpoints
   - Use MSW (Mock Service Worker) to mock HTTP calls

2. Create mock data in `test/mocks/auth0/{domain}/`:
   - Example responses matching Auth0 API response structure
   - Fixture files referenced by handlers

3. Create tests in `test/tools/{domain}.test.ts`:
   - Verify each handler with valid and invalid inputs
   - Test response masking (confirm sensitive fields are `[REDACTED]`)
   - Test error cases (401, 403, 404, 422, 5xx)

Example test:
```typescript
it('should mask client_secret in response', async () => {
  const response = await handler({ token, parameters }, { domain });
  expect(response.content[0].text).toContain('[REDACTED]');
  expect(response.content[0].text).not.toContain('actual_secret_value');
});
```

## Integration Steps

1. Export from `src/tools/{domain}.ts`
2. Import in `src/tools/index.ts`
3. Add to `TOOLS` aggregation: `...DOMAIN_TOOLS`
4. Add to handlers aggregation: `...DOMAIN_HANDLERS`
5. Add mock handlers to `test/mocks/handlers.ts`
6. Add mock data fixtures to `test/mocks/auth0/{domain}/`
7. Run full test suite: `npm test`
8. Run linting: `npm run lint:fix`

## Validation Checklist

- [ ] Tool names follow `auth0_verb_noun` format
- [ ] All handlers call `maskSensitiveFields()` before returning
- [ ] Required scopes are accurate (check Auth0 Management API docs)
- [ ] Input schema matches Auth0 API parameter names
- [ ] Destructive tools set `destructiveHint: true`
- [ ] Read-only tools set `readOnlyHint: true` and `readOnly: true`
- [ ] Test coverage includes masking verification
- [ ] All tests pass: `npm test`
- [ ] No lint errors: `npm run lint`
- [ ] Handlers are added to `src/tools/index.ts` aggregation
- [ ] Mock handlers cover HTTP responses (200, 401, 403, 404, 422, 5xx)
