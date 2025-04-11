import keytar from 'keytar';
import { log } from './logger.js';

/**
 * Service name used for keychain operations
 */
export const KEYCHAIN_SERVICE_NAME = 'auth0-mcp';

/**
 * Keychain item keys for Auth0 related tokens and configuration
 * @readonly
 * @enum {string}
 */
export const KeychainItem = {
  /** Access token for Auth0 Management API */
  TOKEN: 'AUTH0_TOKEN',
  /** Auth0 tenant domain */
  DOMAIN: 'AUTH0_DOMAIN',
  /** OAuth refresh token for obtaining new access tokens */
  REFRESH_TOKEN: 'AUTH0_REFRESH_TOKEN',
  /** Timestamp when the current token expires */
  TOKEN_EXPIRES_AT: 'AUTH0_TOKEN_EXPIRES_AT',
} as const;

/**
 * Array of all keychain item keys for operations that need to process all items
 * @type {string[]}
 */
export const ALL_KEYCHAIN_ITEMS = Object.values(KeychainItem);

/**
 * Type representing the result of a keychain operation
 */
export type KeychainOperationResult = {
  item: string;
  success: boolean;
  error?: Error;
};

/**
 * Keychain service for securely storing Auth0 credentials
 * Provides type-safe methods for working with Auth0 tokens and settings
 */
class KeychainService {
  private serviceName: string;

  /**
   * Creates a new KeychainService instance
   * @param serviceName - The keychain service name to use
   */
  constructor(serviceName: string = KEYCHAIN_SERVICE_NAME) {
    this.serviceName = serviceName;
  }

  /**
   * Store the Auth0 access token in the keychain
   * @param token - The access token to store
   * @returns A promise that resolves to true if successful, false otherwise
   */
  async setToken(token: string): Promise<boolean> {
    return this.set(KeychainItem.TOKEN, token);
  }

  /**
   * Retrieve the Auth0 access token from the keychain
   * @returns A promise that resolves to the access token or null if not found
   */
  async getToken(): Promise<string | null> {
    return this.get(KeychainItem.TOKEN);
  }

  /**
   * Store the Auth0 domain in the keychain
   * @param domain - The domain to store
   * @returns A promise that resolves to true if successful, false otherwise
   */
  async setDomain(domain: string): Promise<boolean> {
    return this.set(KeychainItem.DOMAIN, domain);
  }

  /**
   * Retrieve the Auth0 domain from the keychain
   * @returns A promise that resolves to the domain or null if not found
   */
  async getDomain(): Promise<string | null> {
    return this.get(KeychainItem.DOMAIN);
  }

  /**
   * Store the Auth0 refresh token in the keychain
   * @param refreshToken - The refresh token to store
   * @returns A promise that resolves to true if successful, false otherwise
   */
  async setRefreshToken(refreshToken: string): Promise<boolean> {
    return this.set(KeychainItem.REFRESH_TOKEN, refreshToken);
  }

  /**
   * Retrieve the Auth0 refresh token from the keychain
   * @returns A promise that resolves to the refresh token or null if not found
   */
  async getRefreshToken(): Promise<string | null> {
    return this.get(KeychainItem.REFRESH_TOKEN);
  }

  /**
   * Store the token expiration timestamp in the keychain
   * @param timestamp - The expiration timestamp in milliseconds since epoch
   * @returns A promise that resolves to true if successful, false otherwise
   */
  async setTokenExpiresAt(timestamp: number): Promise<boolean> {
    return this.set(KeychainItem.TOKEN_EXPIRES_AT, timestamp.toString());
  }

  /**
   * Retrieve the token expiration timestamp from the keychain
   * @returns A promise that resolves to the timestamp as a number or null if not found
   */
  async getTokenExpiresAt(): Promise<number | null> {
    const value = await this.get(KeychainItem.TOKEN_EXPIRES_AT);
    return value ? parseInt(value, 10) : null;
  }

  /**
   * Delete all Auth0 related items from the keychain
   * @returns A promise that resolves to an array of results for each deletion operation
   */
  async clearAll(): Promise<KeychainOperationResult[]> {
    const results = await Promise.all(
      ALL_KEYCHAIN_ITEMS.map(async (item) => {
        try {
          const result = await keytar.deletePassword(this.serviceName, item);
          log(`Deleted ${item} from keychain: ${result ? 'Success' : 'Not found'}`);
          return { item, success: result };
        } catch (error) {
          log(`Error deleting ${item} from keychain:`, error);
          if (error instanceof Error) {
            return { item, success: false, error };
          }
          return { item, success: false, error: new Error(String(error)) };
        }
      })
    );

    // Log a summary of the results
    const successCount = results.filter((r) => r.success).length;
    log(`Cleared ${successCount}/${ALL_KEYCHAIN_ITEMS.length} items from keychain`);

    return results;
  }

  /**
   * Delete a specific item from the keychain
   * @param key - The key to delete
   * @returns A promise that resolves to true if successful, false otherwise
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await keytar.deletePassword(this.serviceName, key);
      log(`Deleted ${key} from keychain: ${result ? 'Success' : 'Not found'}`);
      return result;
    } catch (error) {
      log(`Error deleting ${key} from keychain:`, error);
      return false;
    }
  }

  /**
   * Internal method to store a value in the system keychain
   * @param key - The key to store the value under
   * @param value - The value to store
   * @returns A promise that resolves to true if successful, false otherwise
   * @private
   */
  private async set(key: string, value: string): Promise<boolean> {
    try {
      await keytar.setPassword(this.serviceName, key, value);
      log(`Successfully stored ${key} in keychain`);
      return true;
    } catch (error) {
      log(`Error storing ${key} in keychain:`, error);
      return false;
    }
  }

  /**
   * Internal method to retrieve a value from the system keychain
   * @param key - The key to retrieve
   * @returns A promise that resolves to the stored value or null if not found
   * @private
   */
  private async get(key: string): Promise<string | null> {
    try {
      return await keytar.getPassword(this.serviceName, key);
    } catch (error) {
      log(`Error retrieving ${key} from keychain:`, error);
      return null;
    }
  }
}

export const keychain = new KeychainService(KEYCHAIN_SERVICE_NAME);
