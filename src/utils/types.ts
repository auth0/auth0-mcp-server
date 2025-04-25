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
  };
  annotations?: ToolAnnotations;
}

// Define Handler interface
export interface HandlerRequest {
  token: string;
  parameters: Record<string, any>;
  authHeader?: string;
}

export interface HandlerConfig {
  domain: string | undefined;
}

// Standard response interface
export interface HandlerResponse {
  content: Array<{
    type: string;
    [key: string]: any;
  }>;
  isError: boolean;
}

// Streaming response interface compatible with MCP SDK
export interface StreamingResponse {
  write: (chunk: any) => void;
  end: () => void;
}

// Request handler extras including streaming response, matching MCP SDK types
export interface RequestHandlerExtra {
  streaming?: StreamingResponse;
  [key: string]: unknown;
}

// Define transport interfaces
export interface ServerTransport {
  onRequest: (callback: (request: any, response?: StreamingResponse) => Promise<void>) => void;
  close?: () => Promise<void>;
}

// Define HTTP streaming options
export interface HttpServerOptions {
  port?: number;
  host?: string;
  authToken?: string;
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
