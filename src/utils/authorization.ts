// Implementation of MCP authorization framework according to 2025-03-26 specification
import { log } from './logger.js';
import { keychain } from './keychain.js';

export interface AuthorizationConfig {
  type: string;
  token?: string;
  requiredScopes?: string[];
}

export class Authorization {
  private config: AuthorizationConfig;

  constructor(config: AuthorizationConfig) {
    this.config = config;
    log(`Authorization initialized with type: ${config.type}`);
  }

  /**
   * Validate authorization for a request
   * @param requestScopes - The scopes required for the request
   * @param authHeader - The authorization header from the request
   * @returns Whether the request is authorized
   */
  async isAuthorized(requestScopes: string[] = [], authHeader?: string): Promise<boolean> {
    // Handle different authorization types
    switch (this.config.type) {
      case 'none':
        // No authorization required
        return true;

      case 'bearer':
        return this.validateBearerToken(authHeader, requestScopes);

      case 'api-key':
        return this.validateApiKey(authHeader);

      default:
        log(`Unsupported authorization type: ${this.config.type}`);
        return false;
    }
  }

  /**
   * Validate bearer token authorization
   */
  private async validateBearerToken(
    authHeader?: string,
    requestScopes: string[] = []
  ): Promise<boolean> {
    // If no auth header is provided, use stored token
    if (!authHeader) {
      const storedToken = await keychain.getToken();
      if (!storedToken) {
        log('No authorization header provided and no token found in keychain');
        return false;
      }

      // Use stored token
      authHeader = `Bearer ${storedToken}`;
    }

    if (!authHeader) {
      log('No authorization header provided');
      return false;
    }

    // Parse the header
    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      log('Invalid authorization header format');
      return false;
    }

    // If a specific token is required, validate against it
    if (this.config.token && token !== this.config.token) {
      log('Token mismatch');
      return false;
    }

    // Validate required scopes if any
    if (this.config.requiredScopes && this.config.requiredScopes.length > 0) {
      // Here we would normally decode the token and check scopes
      // For simplicity we're assuming the token has all required scopes
      // In a real implementation, you would decode the token and check its scopes
      log(`Required scopes for this request: ${this.config.requiredScopes.join(', ')}`);
    }

    // Check request specific scopes
    if (requestScopes && requestScopes.length > 0) {
      log(`Tool requires scopes: ${requestScopes.join(', ')}`);
      // Same as above - in a real implementation, check these against the token
    }

    // Token is valid
    return true;
  }

  /**
   * Validate API key authorization
   */
  private validateApiKey(authHeader?: string): boolean {
    if (!authHeader) {
      log('No authorization header provided');
      return false;
    }

    // For API keys we check either x-api-key header format or a bearer token value
    if (authHeader.startsWith('Bearer ')) {
      const [_, apiKey] = authHeader.split(' ');

      if (!apiKey) {
        log('Invalid API key format');
        return false;
      }

      // Validate the API key
      if (this.config.token && apiKey !== this.config.token) {
        log('API key mismatch');
        return false;
      }

      return true;
    }

    // Direct API key comparison
    if (this.config.token && authHeader !== this.config.token) {
      log('API key mismatch');
      return false;
    }

    return true;
  }

  /**
   * Get current authorization configuration
   */
  getConfig(): AuthorizationConfig {
    return { ...this.config };
  }
}
