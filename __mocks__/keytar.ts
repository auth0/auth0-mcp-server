import { vi } from 'vitest';

export default {
  getPassword: vi.fn().mockResolvedValue(null),
  setPassword: vi.fn().mockResolvedValue(undefined),
  deletePassword: vi.fn().mockResolvedValue(false),
  findCredentials: vi.fn().mockResolvedValue([]),
};
