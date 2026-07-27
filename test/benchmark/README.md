# Schema Fix Benchmarks

Each file in this directory benchmarks one tool schema fix from the 400-error analysis (Apr 2025–Jul 2026).

## Approach

Tests are deterministic — no LLM is invoked. Each file encodes:

1. **Bad inputs**: fixed parameters that represent what an LLM would send based on the *current* schema description. The MSW mock validates the request and returns 400 for known-invalid values, matching the real API behavior.
2. **Good inputs**: corrected parameters a well-guided LLM would send after the schema fix. The mock returns 200.
3. **Schema inspection**: assertions on the tool's `inputSchema` that verify the fix is present (enum values, description content, required fields, property constraints).

## Structure

Each benchmark file runs as part of `npm test`. The "before" tests document the gap. The "after" tests verify the fix. Both suites pass after a fix is applied — the "before" suite remains as a regression guard.

## Files

| File | Tool | Error Count | Root Cause |
|------|------|-------------|------------|
| `logs.benchmark.test.ts` | `auth0_list_logs` | 661 | `q` description missing valid field names — LLM sends `user_email` which does not exist in Auth0 logs |
