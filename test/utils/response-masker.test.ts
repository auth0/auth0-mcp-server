import { describe, it, expect } from 'vitest';
import {
  maskSensitiveFields,
  containsSensitiveFields,
  getSensitiveFieldNames,
} from '../../src/utils/response-masker.js';

describe('response-masker', () => {
  describe('maskSensitiveFields', () => {
    it('should mask client_secret in object', () => {
      const data = {
        client_id: 'abc123',
        name: 'Test App',
        client_secret: 'super_secret_value',
      };

      const masked = maskSensitiveFields(data);

      expect(masked.client_id).toBe('abc123');
      expect(masked.name).toBe('Test App');
      expect(masked.client_secret).toBe('[REDACTED]');
    });

    it('should mask multiple sensitive fields', () => {
      const data = {
        client_id: 'abc123',
        client_secret: 'secret1',
        signing_keys: ['key1', 'key2'],
        encryption_key: 'enc_key',
        normal_field: 'normal_value',
      };

      const masked = maskSensitiveFields(data);

      expect(masked.client_id).toBe('abc123');
      expect(masked.client_secret).toBe('[REDACTED]');
      expect(masked.signing_keys).toBe('[REDACTED]');
      expect(masked.encryption_key).toBe('[REDACTED]');
      expect(masked.normal_field).toBe('normal_value');
    });

    it('should handle nested objects', () => {
      const data = {
        client_id: 'abc123',
        jwt_configuration: {
          alg: 'RS256',
          client_secret: 'nested_secret',
        },
      };

      const masked = maskSensitiveFields(data);

      expect(masked.client_id).toBe('abc123');
      expect(masked.jwt_configuration.alg).toBe('RS256');
      expect(masked.jwt_configuration.client_secret).toBe('[REDACTED]');
    });

    it('should handle arrays of objects', () => {
      const data = [
        { client_id: 'app1', client_secret: 'secret1' },
        { client_id: 'app2', client_secret: 'secret2' },
      ];

      const masked = maskSensitiveFields(data);

      expect(masked[0].client_id).toBe('app1');
      expect(masked[0].client_secret).toBe('[REDACTED]');
      expect(masked[1].client_id).toBe('app2');
      expect(masked[1].client_secret).toBe('[REDACTED]');
    });

    it('should use custom replacement text', () => {
      const data = {
        client_secret: 'secret',
      };

      const masked = maskSensitiveFields(data, {
        replacement: '***HIDDEN***',
      });

      expect(masked.client_secret).toBe('***HIDDEN***');
    });

    it('should merge custom sensitive fields with defaults', () => {
      const data = {
        client_secret: 'secret',
        custom_sensitive: 'sensitive_value',
        normal_field: 'normal',
      };

      const masked = maskSensitiveFields(data, {
        sensitiveFields: ['custom_sensitive'],
      });

      // client_secret should STILL be masked (defaults are preserved)
      expect(masked.client_secret).toBe('[REDACTED]');
      // custom field should also be masked
      expect(masked.custom_sensitive).toBe('[REDACTED]');
      // normal field should not be masked
      expect(masked.normal_field).toBe('normal');
    });

    it('should handle primitives without error', () => {
      expect(maskSensitiveFields('string')).toBe('string');
      expect(maskSensitiveFields(123)).toBe(123);
      expect(maskSensitiveFields(null)).toBe(null);
      expect(maskSensitiveFields(undefined)).toBe(undefined);
    });

    it('should handle empty objects', () => {
      const masked = maskSensitiveFields({});
      expect(masked).toEqual({});
    });

    it('should not mutate original object', () => {
      const original = {
        client_id: 'abc123',
        client_secret: 'secret',
      };

      const masked = maskSensitiveFields(original);

      expect(original.client_secret).toBe('secret');
      expect(masked.client_secret).toBe('[REDACTED]');
    });

    it('should only mask fields with exact name match', () => {
      const data = {
        my_client_secret: 'secret1',
        api_token: 'token123',
        refresh_token_value: 'refresh123',
        client_secret: 'real_secret',
        refresh_token: 'real_refresh',
      };

      const masked = maskSensitiveFields(data);

      // Partial matches should NOT be masked
      expect(masked.my_client_secret).toBe('secret1');
      expect(masked.api_token).toBe('token123');
      expect(masked.refresh_token_value).toBe('refresh123');
      // Exact matches should be masked
      expect(masked.client_secret).toBe('[REDACTED]');
      expect(masked.refresh_token).toBe('[REDACTED]');
    });

    it('should handle case-insensitive matching', () => {
      const data = {
        CLIENT_SECRET: 'secret',
        Client_Secret: 'secret2',
      };

      const masked = maskSensitiveFields(data);

      expect(masked.CLIENT_SECRET).toBe('[REDACTED]');
      expect(masked.Client_Secret).toBe('[REDACTED]');
    });

    it('should not mask null or undefined values', () => {
      const data = {
        client_secret: null,
        signing_keys: undefined,
        normal_field: null,
      };

      const masked = maskSensitiveFields(data);

      // Should not mask null/undefined values
      expect(masked.client_secret).toBeNull();
      expect(masked.signing_keys).toBeUndefined();
      expect(masked.normal_field).toBeNull();
    });
  });

  describe('containsSensitiveFields', () => {
    it('should return true when sensitive fields exist', () => {
      const data = {
        client_id: 'abc123',
        client_secret: 'secret',
      };

      expect(containsSensitiveFields(data)).toBe(true);
    });

    it('should return false when no sensitive fields exist', () => {
      const data = {
        client_id: 'abc123',
        name: 'Test App',
      };

      expect(containsSensitiveFields(data)).toBe(false);
    });

    it('should detect sensitive fields in nested objects', () => {
      const data = {
        client_id: 'abc123',
        config: {
          client_secret: 'nested_secret',
        },
      };

      expect(containsSensitiveFields(data)).toBe(true);
    });

    it('should detect sensitive fields in arrays', () => {
      const data = [{ client_id: 'app1' }, { client_id: 'app2', client_secret: 'secret' }];

      expect(containsSensitiveFields(data)).toBe(true);
    });

    it('should return false for primitives', () => {
      expect(containsSensitiveFields('string')).toBe(false);
      expect(containsSensitiveFields(123)).toBe(false);
      expect(containsSensitiveFields(null)).toBe(false);
    });
  });

  describe('getSensitiveFieldNames', () => {
    it('should return list of sensitive field names', () => {
      const data = {
        client_id: 'abc123',
        client_secret: 'secret',
        signing_keys: ['key1'],
        name: 'Test',
      };

      const fields = getSensitiveFieldNames(data);

      expect(fields).toContain('client_secret');
      expect(fields).toContain('signing_keys');
      expect(fields).not.toContain('client_id');
      expect(fields).not.toContain('name');
    });

    it('should return paths for nested fields', () => {
      const data = {
        client_id: 'abc123',
        jwt_configuration: {
          alg: 'RS256',
          client_secret: 'nested_secret',
        },
      };

      const fields = getSensitiveFieldNames(data);

      expect(fields).toContain('jwt_configuration.client_secret');
    });

    it('should return paths for array items', () => {
      const data = [
        { client_id: 'app1', client_secret: 'secret1' },
        { client_id: 'app2', client_secret: 'secret2' },
      ];

      const fields = getSensitiveFieldNames(data);

      expect(fields).toContain('[0].client_secret');
      expect(fields).toContain('[1].client_secret');
    });

    it('should return empty array when no sensitive fields exist', () => {
      const data = {
        client_id: 'abc123',
        name: 'Test',
      };

      const fields = getSensitiveFieldNames(data);

      expect(fields).toEqual([]);
    });
  });
});
