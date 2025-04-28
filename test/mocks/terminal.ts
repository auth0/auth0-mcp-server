import { vi } from 'vitest';

// This mock provides replacements for terminal.js functions for testing
export const cliOutput = vi.fn().mockReturnValue(true);
export const startSpinner = vi.fn();
export const stopSpinner = vi.fn();
export const getTenantFromToken = vi.fn().mockReturnValue('test-tenant.auth0.com');
export const promptForBrowserPermission = vi.fn().mockResolvedValue(true);
export const promptForScopeSelection = vi.fn().mockResolvedValue([]);
export const maskTenantName = vi.fn().mockImplementation((name) => `masked-${name}`);
