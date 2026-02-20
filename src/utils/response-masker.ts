import { log } from './logger.js';

/**
 * Options for masking sensitive fields
 */
export interface MaskOptions {
  sensitiveFields?: string[];
  replacement?: string;
  showPartial?: boolean;
}

/**
 * Default sensitive fields that should be masked in responses
 */
const DEFAULT_SENSITIVE_FIELDS = [
  'client_secret',
  'signing_keys',
  'encryption_key',
  'client_assertion',
  'signing_key',
  'secret',
  'private_key',
  'password',
  'token',
  'refresh_token',
  'access_token',
];

/**
 * Default replacement text for masked fields
 */
const DEFAULT_REPLACEMENT = '[REDACTED]';

/**
 * Masks sensitive fields in an object or array
 *
 * This function recursively traverses the data structure and replaces
 * values of sensitive fields with a redaction message. This prevents
 * secrets from appearing in MCP client logs while maintaining the
 * structure of the response for AI consumption.
 *
 * @param data - The data to mask (object, array, or primitive)
 * @param options - Optional configuration for which fields to mask and replacement text
 * @returns A new object/array with sensitive fields masked
 */
export function maskSensitiveFields(data: any, options?: MaskOptions): any {
  // Merge custom fields with defaults (don't replace)
  const fieldsToMask = options?.sensitiveFields
    ? [...DEFAULT_SENSITIVE_FIELDS, ...options.sensitiveFields]
    : DEFAULT_SENSITIVE_FIELDS;
  const replacement = options?.replacement || DEFAULT_REPLACEMENT;

  // Handle primitives
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveFields(item, options));
  }

  // Handle objects
  const masked: Record<string, any> = {};
  let maskedCount = 0;

  for (const key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }

    const value = data[key];

    // Check if this field should be masked
    const shouldMask = fieldsToMask.some((sensitiveField) =>
      key.toLowerCase().includes(sensitiveField.toLowerCase())
    );

    if (shouldMask && value) {
      masked[key] = replacement;
      maskedCount++;
      log(`Masked sensitive field: ${key}`);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively mask nested objects
      masked[key] = maskSensitiveFields(value, options);
    } else {
      masked[key] = value;
    }
  }

  if (maskedCount > 0) {
    log(`Masked ${maskedCount} sensitive field(s) in response`);
  }

  return masked;
}

/**
 * Checks if an object contains any sensitive fields
 *
 * @param data - The data to check
 * @param sensitiveFields - Optional list of sensitive field names
 * @returns True if sensitive fields are found, false otherwise
 */
export function containsSensitiveFields(
  data: any,
  sensitiveFields?: string[]
): boolean {
  const fieldsToCheck = sensitiveFields || DEFAULT_SENSITIVE_FIELDS;

  if (typeof data !== 'object' || data === null) {
    return false;
  }

  if (Array.isArray(data)) {
    return data.some((item) => containsSensitiveFields(item, sensitiveFields));
  }

  for (const key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }

    const shouldMask = fieldsToCheck.some((sensitiveField) =>
      key.toLowerCase().includes(sensitiveField.toLowerCase())
    );

    if (shouldMask && data[key]) {
      return true;
    }

    if (typeof data[key] === 'object' && data[key] !== null) {
      if (containsSensitiveFields(data[key], sensitiveFields)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Gets a list of sensitive field names found in the data
 *
 * @param data - The data to analyze
 * @param sensitiveFields - Optional list of sensitive field names
 * @returns Array of sensitive field names found
 */
export function getSensitiveFieldNames(
  data: any,
  sensitiveFields?: string[]
): string[] {
  const fieldsToCheck = sensitiveFields || DEFAULT_SENSITIVE_FIELDS;
  const foundFields = new Set<string>();

  function traverse(obj: any, path: string = ''): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => traverse(item, `${path}[${index}]`));
      return;
    }

    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        continue;
      }

      const fullPath = path ? `${path}.${key}` : key;
      const shouldMask = fieldsToCheck.some((sensitiveField) =>
        key.toLowerCase().includes(sensitiveField.toLowerCase())
      );

      if (shouldMask && obj[key]) {
        foundFields.add(fullPath);
      }

      if (typeof obj[key] === 'object' && obj[key] !== null) {
        traverse(obj[key], fullPath);
      }
    }
  }

  traverse(data);
  return Array.from(foundFields);
}
