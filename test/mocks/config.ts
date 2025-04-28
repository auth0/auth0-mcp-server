import { vi } from 'vitest';

// Mock configuration for testing
export const mockConfig = {
  tenantName: 'test-tenant',
  domain: 'test-tenant.auth0.com',
  token: 'mock-token',
};

// Mock function to load configuration
export const mockLoadConfig = vi.fn().mockResolvedValue(mockConfig);

// Mock function to validate configuration
export const mockValidateConfig = vi.fn().mockResolvedValue(true);
