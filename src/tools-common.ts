import debug from 'debug';
import fetch from 'node-fetch';

// Set up debug logger
export const log = debug('auth0-mcp:tools');

// Make debug more verbose for network operations
export const httpLog = debug('auth0-mcp:http');

// Make sure debug output goes to stderr
debug.log = (...args) => {
  const msg = args.join(' ');
  process.stderr.write(msg + '\n');
  return true;
};

// Add network error handling utility
export function handleNetworkError(error: any): string {
  if (error.name === 'AbortError') {
    return 'Request timed out. The Auth0 API did not respond in time.';
  } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return `Connection failed: Unable to reach the Auth0 API (${error.code}). Check your network connection.`;
  } else if (error.code === 'ECONNRESET') {
    return 'Connection was reset by the server. Try again later.';
  } else {
    return `Network error: ${error.message || error}`;
  }
}

// Define Tool interface
export interface Tool {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
}

// Define Handler interface
export interface HandlerRequest {
  token: string;
  parameters: Record<string, any>;
}

export interface HandlerConfig {
  domain: string | undefined;
}

export interface ToolResult {
  content: Array<{
    type: string;
    [key: string]: any;
  }>;
  isError: boolean;
}

export interface HandlerResponse {
  toolResult: ToolResult;
}

// Auth0 response interfaces
export interface Auth0Application {
  client_id: string;
  name: string;
  [key: string]: any;
}

export interface Auth0ResourceServer {
  id: string;
  name: string;
  identifier: string;
  [key: string]: any;
}

export interface Auth0PaginatedResponse {
  clients?: Auth0Application[];
  resource_servers?: Auth0ResourceServer[];
  total?: number;
  page?: number;
  per_page?: number;
  [key: string]: any;
}

// Helper function to ensure domain is properly formatted
export function formatDomain(domain: string): string {
  return domain.includes('.') ? domain : `${domain}.us.auth0.com`;
}

// Helper function to create error response
export function createErrorResponse(message: string): HandlerResponse {
  return {
    toolResult: {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    },
  };
}
