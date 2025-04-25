// HTTP Transport implementation for MCP Server
import { log } from './logger.js';
import { StreamingResponse } from './types.js';

// Define Transport interface matching MCP SDK's transport interface
interface Transport {
  onRequest(callback: (request: any, extra?: any) => Promise<any>): void;
  send(message: any): Promise<void>;
  close?(): Promise<void>;
}

// Implementation of streamable HTTP transport according to MCP specification 2025-03-26
export class StreamableHttpServerTransport implements Transport {
  private server: any;
  private port: number;
  private authToken: string | null = null;

  constructor(options: { port?: number; authToken?: string } = {}) {
    this.port = options.port || 3000;
    this.authToken = options.authToken || null;
    log(`Initializing StreamableHttpServerTransport on port ${this.port}`);
  }

  // Method to start the HTTP server
  async start(): Promise<void> {
    try {
      // Use Node.js native http module
      const http = await import('node:http');
      const url = await import('node:url');

      // Create HTTP server
      this.server = http.createServer(async (req, res) => {
        log(`Received ${req.method} request to ${req.url}`);

        // Handle preflight CORS requests
        if (req.method === 'OPTIONS') {
          this.setCorsHeaders(res);
          res.writeHead(204);
          res.end();
          return;
        }

        // Validate request
        if (req.method !== 'POST' || !req.url?.startsWith('/v1')) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }

        // Apply CORS headers
        this.setCorsHeaders(res);

        // Check authorization if configured
        if (this.authToken && !this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        // Handle streaming request
        try {
          // Read request body
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const parsedBody = JSON.parse(body);

              // Get headers from request for authorization
              const headers = req.headers || {};

              // Add headers to request
              parsedBody.headers = headers;

              // Prepare response headers for streaming
              res.writeHead(200, {
                'Content-Type': 'application/x-ndjson',
                'Transfer-Encoding': 'chunked',
              });

              // Forward the request to the onRequest handler
              if (this.onRequestCallback) {
                // Create streaming response object
                const streamResponse: StreamingResponse = {
                  write: (data: any) => {
                    res.write(JSON.stringify(data) + '\n');
                  },
                  end: () => {
                    res.end();
                  },
                };

                // Pass request to handler with streaming response
                await this.onRequestCallback(parsedBody, { streaming: streamResponse });
              } else {
                res.end(JSON.stringify({ error: 'No request handler configured' }));
              }
            } catch (err) {
              log('Error processing request:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal server error' }));
            }
          });
        } catch (err) {
          log('Error handling request:', err);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad request' }));
        }
      });

      // Start server
      this.server.listen(this.port, () => {
        log(`Streamable HTTP server running on port ${this.port}`);
      });

      // Handle server errors
      this.server.on('error', (err: Error) => {
        log('HTTP server error:', err);
      });
    } catch (err) {
      log('Failed to start HTTP transport:', err);
      throw err;
    }
  }

  // Helper to set CORS headers
  private setCorsHeaders(res: any): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // Check authorization header
  private isAuthorized(req: any): boolean {
    const authHeader = req.headers.authorization;

    if (!authHeader || !this.authToken) {
      return false;
    }

    // Extract token from header
    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      return false;
    }

    // Compare with configured token
    return token === this.authToken;
  }

  // Used by MCP SDK to set request handler
  onRequest(
    callback: (request: any, extra?: { streaming: StreamingResponse }) => Promise<any>
  ): void {
    this.onRequestCallback = callback;
  }

  private onRequestCallback:
    | ((request: any, extra?: { streaming: StreamingResponse }) => Promise<any>)
    | null = null;

  // Cleanup resources
  async close(): Promise<void> {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server.close((err: Error) => {
          if (err) {
            log('Error closing server:', err);
            reject(err);
          } else {
            log('HTTP server closed');
            resolve();
          }
        });
      });
    }
  }

  // Implementation of send method required by Transport interface
  // In HTTP streaming, we don't use this method directly as responses are handled by streaming
  // But we need to implement it for the Transport interface
  async send(message: any): Promise<void> {
    log('HTTP Transport send method called. This is not used in streaming mode.');
    // No-op for HTTP streaming transport, but we need to return a Promise
    return Promise.resolve();
  }
}
