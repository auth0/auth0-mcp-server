import { describe, it, expect, vi, assert } from 'vitest';
import { getAvailableTools, validatePatterns } from '../../src/utils/tools.js';
import { Tool } from '../../src/utils/types.js';
import { log } from '../../src/utils/logger.js';

// Mock external dependencies
vi.mock('../../src/utils/logger.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

describe('Tool Utilities', () => {
  // Common test fixtures
  const testTools: Tool[] = [
    {
      name: 'auth0_list_applications',
      description: 'List all applications',
      _meta: {
        requiredScopes: ['read:clients'],
        readOnly: true,
      },
    },
    {
      name: 'auth0_get_application',
      description: 'Get application details',
      _meta: {
        requiredScopes: ['read:clients'],
        readOnly: true,
      },
    },
    {
      name: 'auth0_create_application',
      description: 'Create application',
      _meta: {
        requiredScopes: ['create:clients'],
      },
    },
    {
      name: 'auth0_update_application',
      description: 'Update application',
      _meta: {
        requiredScopes: ['update:clients'],
      },
    },
    {
      name: 'auth0_list_resource_servers',
      description: 'List resource servers',
      _meta: {
        requiredScopes: ['read:resource_servers'],
        readOnly: true,
      },
    },
    {
      name: 'auth0_get_resource_server',
      description: 'Get resource server details',
      _meta: {
        requiredScopes: ['read:resource_servers'],
        readOnly: true,
      },
    },
  ];

  describe('validatePatterns function', () => {
    it('should not throw for valid tool names', () => {
      expect(() => validatePatterns(['auth0_list_applications'], testTools)).not.toThrow();
    });

    it('should not throw for valid glob patterns', () => {
      expect(() => validatePatterns(['auth0_*'], testTools)).not.toThrow();
    });

    it('should not throw for multiple valid patterns', () => {
      expect(() => validatePatterns(['auth0_list_*', 'auth0_get_*'], testTools)).not.toThrow();
    });

    it('should validate each pattern in the array', () => {
      expect(() =>
        validatePatterns(['auth0_list_applications', 'nonexistent_tool'], testTools)
      ).toThrow(/Invalid tool: nonexistent_tool/);
    });

    it("should throw for tool names that don't exist", () => {
      expect(() => validatePatterns(['nonexistent_tool'], testTools)).toThrow(
        /Invalid tool: nonexistent_tool/
      );
    });

    it("should throw for glob patterns that don't match any tools", () => {
      expect(() => validatePatterns(['xyz_*_tool'], testTools)).toThrow(
        /No tools match the pattern/
      );
    });

    it('should list valid tools in the error message for invalid tool names', () => {
      try {
        validatePatterns(['nonexistent_tool'], testTools);
        assert.fail('Expected an error to be thrown');
      } catch (error: any) {
        // Error should include available tool names for user guidance
        expect(error.message).toContain('auth0_list_applications');
        expect(error.message).toContain('auth0_get_application');
      }
    });

    it('should handle empty pattern array', () => {
      expect(() => validatePatterns([], testTools)).not.toThrow();
    });

    it('should handle patterns with special regex characters', () => {
      expect(() => validatePatterns(['auth0_list_applications+'], testTools)).toThrow(
        /Invalid tool/
      );
      expect(() => validatePatterns(['auth0_[list]_applications'], testTools)).toThrow(
        /Invalid tool/
      );
    });

    it('should throw appropriate error for null or undefined tools array', () => {
      expect(() => validatePatterns(['auth0_list_applications'], null as any)).toThrow();
      expect(() => validatePatterns(['auth0_list_applications'], undefined as any)).toThrow();
    });

    it('should throw with descriptive message when no tools are provided', () => {
      expect(() => validatePatterns(['auth0_list_applications'], [])).toThrow(
        /no tools available/i
      );
    });
  });

  describe('getAvailableTools function', () => {
    it('should return all tools when no patterns are provided', () => {
      const result = getAvailableTools(testTools);
      expect(result).toEqual(testTools);
    });

    it('should return all tools when patterns is an empty array', () => {
      const result = getAvailableTools(testTools, []);
      expect(result).toEqual(testTools);
    });

    it('should return all tools when the special "*" selector is specified', () => {
      const result = getAvailableTools(testTools, ['*']);
      expect(result).toEqual(testTools);
    });

    it('should filter tools by exact name match', () => {
      const result = getAvailableTools(testTools, ['auth0_list_applications']);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('auth0_list_applications');
    });

    it('should filter tools by multiple specific names', () => {
      const result = getAvailableTools(testTools, [
        'auth0_list_applications',
        'auth0_get_application',
      ]);

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name)).toContain('auth0_list_applications');
      expect(result.map((t) => t.name)).toContain('auth0_get_application');
    });

    it('should filter tools by glob pattern', () => {
      const result = getAvailableTools(testTools, ['auth0_*_application']);

      expect(result.length).toBeGreaterThan(0);
      expect(
        result.every((t) => t.name.startsWith('auth0_') && t.name.endsWith('_application'))
      ).toBe(true);
    });

    it('should handle multiple glob patterns correctly', () => {
      const result = getAvailableTools(testTools, ['auth0_get_*', '*_resource_*']);

      // Verify results contain matches for both patterns
      const hasGetTools = result.some((t) => t.name.startsWith('auth0_get_'));
      const hasResourceTools = result.some((t) => t.name.includes('_resource_'));

      expect(hasGetTools).toBe(true);
      expect(hasResourceTools).toBe(true);
    });

    it('should handle tools with whitespace in names', () => {
      const toolWithSpace = {
        name: 'tool with space',
        description: 'Test tool',
      };

      const result = getAvailableTools([toolWithSpace], ['tool with space']);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('tool with space');
    });

    it('should perform case-sensitive filtering', () => {
      const result = getAvailableTools(testTools, ['AUTH0_LIST_APPLICATIONS']);
      expect(result).toHaveLength(0); // Should not match due to case difference
    });

    // Since we can't easily mock errors with ESM, we'll test this indirectly
    it('catches errors during tool pattern matching', () => {
      // We need to verify the try/catch block in the code works.
      // Since we can't easily induce an error in a test environment with ESM modules,
      // we'll verify that the function doesn't throw even with invalid globs.
      const result = getAvailableTools(testTools, ['[']); // Invalid regex pattern
      expect(result).toBeDefined();
    });

    it('should filter tools when readOnly is true', () => {
      const result = getAvailableTools(testTools, undefined, true);

      expect(result).toHaveLength(4);
      // Should only include list_* and get_* tools
      expect(result.map((t) => t.name)).toContain('auth0_list_applications');
      expect(result.map((t) => t.name)).toContain('auth0_get_application');
      expect(result.map((t) => t.name)).toContain('auth0_list_resource_servers');
      expect(result.map((t) => t.name)).toContain('auth0_get_resource_server');

      // Should not include create or update tools
      expect(result.map((t) => t.name)).not.toContain('auth0_create_application');
      expect(result.map((t) => t.name)).not.toContain('auth0_update_application');
    });

    it('should apply readOnly filter after pattern filtering', () => {
      // First filter by applications, then apply readOnly
      const result = getAvailableTools(testTools, ['auth0_*_application*'], true);

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name)).toContain('auth0_list_applications');
      expect(result.map((t) => t.name)).toContain('auth0_get_application');
      expect(result.map((t) => t.name)).not.toContain('auth0_create_application');
      expect(result.map((t) => t.name)).not.toContain('auth0_update_application');
    });

    it('should prioritize --read-only flag over --tools when both are specified', () => {
      // Pattern includes all application tools (including create/update)
      // But --read-only should take priority and filter out non-read-only tools
      const result = getAvailableTools(testTools, ['auth0_*_application*'], true);

      // Should ONLY include read-only tools, even though pattern matched non-read-only tools too
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((tool) => tool._meta?.readOnly === true)).toBe(true);
      expect(result.map((t) => t.name)).toContain('auth0_list_applications');
      expect(result.map((t) => t.name)).toContain('auth0_get_application');
      expect(result.map((t) => t.name)).not.toContain('auth0_create_application');
      expect(result.map((t) => t.name)).not.toContain('auth0_update_application');
    });
  });
});
