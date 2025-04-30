// This file contains common types and interfaces used across the application.

// Define ToolAnnotations interface based on MCP schema 2025-03-26
export interface ToolAnnotations {
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  readOnlyHint?: boolean;
  title?: string;
}

// Define Tool interface
export interface Tool {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
  _meta?: {
    requiredScopes: string[];
    readOnly?: boolean;
  };
  annotations?: ToolAnnotations;
}

// Define Handler interface
export interface HandlerRequest {
  token: string;
  parameters: Record<string, any>;
}

export interface HandlerConfig {
  domain: string | undefined;
}

export interface HandlerResponse {
  content: Array<{
    type: string;
    [key: string]: any;
  }>;
  isError: boolean;
}

// Client Options interface
export interface ClientOptions {
  tools: string[];
  readOnly?: boolean;
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
