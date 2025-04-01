// This file contains common types and interfaces used across the application.

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
