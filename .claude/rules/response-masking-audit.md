# Response Masking Audit Rules

This rule enforces security standards for sensitive field masking in all tool handlers.

**No paths frontmatter (unconditional — always loaded)**

## Security Requirement

**All tool handlers must call `maskSensitiveFields()` on API responses before returning them to the MCP client.**

Failing to mask exposes secrets (client credentials, keys, tokens) to the AI assistant's logs and context window, creating a data exfiltration risk.

## Masked Fields (Default List)

By default, `maskSensitiveFields()` redacts these fields in any API response:

- `client_secret` — Auth0 application secret
- `signing_keys` — JWK signing keys array
- `encryption_key` — Application encryption key
- `signing_key` — Single signing key
- `private_key` — Private key (PKI, OAuth)
- `refresh_token` — Long-lived token

All matches are case-insensitive and recursive (nested objects/arrays are traversed).

Replacement text: `[REDACTED]` (configurable via `MaskOptions.replacement`)

## Implementation Pattern

```typescript
import { maskSensitiveFields } from '../utils/response-masker.js';

// In every handler, before returning:
const maskedResponse = maskSensitiveFields(apiResponse);
return createSuccessResponse(maskedResponse);
```

Do NOT return raw API responses; always mask first.

## Handler Checklist

For each handler in `src/tools/{domain}.ts`:

- [ ] Imports `maskSensitiveFields` from `../utils/response-masker.js`
- [ ] Calls `maskSensitiveFields()` on all API response objects before returning
- [ ] Does NOT return raw API response without masking
- [ ] Handles arrays of objects (each object is recursively masked)
- [ ] Tests verify masking: sensitive field values are `[REDACTED]` in response text
- [ ] Error responses do NOT contain unmasked secrets in error messages

## Test Verification

All tests must verify masking:

```typescript
import { maskSensitiveFields, containsSensitiveFields } from '../utils/response-masker.js';

it('should mask client_secret in response', async () => {
  // Call handler
  const response = await handler({ token, parameters }, { domain });
  
  // Parse response text
  const responseText = response.content[0].text;
  
  // Verify masking
  expect(responseText).toContain('[REDACTED]');
  expect(responseText).not.toContain('secret_value_');
  
  // Optional: use audit function
  const unmaskedSecrets = containsSensitiveFields(JSON.parse(responseText));
  expect(unmaskedSecrets).toBe(false);
});
```

## Audit Functions

`src/utils/response-masker.ts` provides three audit functions:

1. **`maskSensitiveFields(data, options?)`** — Redacts sensitive fields, returns masked copy
2. **`containsSensitiveFields(data, fields?)`** — Returns true if unmasked secrets found
3. **`getSensitiveFieldNames(data, fields?)`** — Lists which fields contain secrets

Use these to verify masking before release:

```typescript
// In a safety check before returning to client:
if (containsSensitiveFields(result)) {
  const foundFields = getSensitiveFieldNames(result);
  log(`WARNING: Unmasked fields detected: ${foundFields.join(', ')}`);
}
```

## Adding Custom Sensitive Fields

If a domain exposes new secret types, extend the mask list:

```typescript
const customMask = maskSensitiveFields(response, {
  sensitiveFields: ['api_key', 'webhook_secret'],  // Added to defaults
  replacement: '[REDACTED]'
});
```

## Common Mistakes

1. **Returning API response directly without masking**
   - ❌ `return createSuccessResponse(apiResponse);`
   - ✅ `return createSuccessResponse(maskSensitiveFields(apiResponse));`

2. **Masking only top-level fields**
   - ❌ `maskSensitiveFields()` only if top-level keys are masked
   - ✅ Recursive masking handles nested objects and arrays automatically

3. **Assuming structured responses**
   - ❌ Skipping masking if "I know this endpoint doesn't return secrets"
   - ✅ Always mask (Auth0 API may change, error responses may include secrets)

4. **Error responses with embedded secrets**
   - ❌ Logging or returning error messages that include raw credentials
   - ✅ Mask error objects if they contain API response data

## Enforcement

- Code review: All handlers must show masking call before merging
- Tests: Coverage excludes `src/utils/` but handlers must test masking
- Linting: No warning for masking (it's always correct)
- Security audit: Handlers reviewed periodically for compliance

## References

- Implementation: `src/utils/response-masker.ts`
- Handler pattern: `src/tools/applications.ts` (all handlers use masking)
- Test pattern: `test/tools/applications.test.ts`
