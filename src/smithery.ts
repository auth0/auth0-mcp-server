import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import { HANDLERS, TOOLS } from './tools/index.js';
import { formatDomain } from './utils/http-utility.js';
import { packageVersion } from './utils/package.js';
import { getAvailableTools } from './utils/tools.js';

export const configSchema = z.object({
  domain: z.string().describe('Auth0 tenant domain (e.g. your-tenant.auth0.com)'),
  token: z.string().describe('Auth0 Management API token'),
});

export default function createServer({ config }: { config: z.infer<typeof configSchema> }) {
  const domain = formatDomain(config.domain);
  const availableTools = getAvailableTools(TOOLS, ['*'], false);

  const server = new Server(
    { name: 'auth0', version: packageVersion },
    { capabilities: { tools: {}, logging: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const sanitizedTools = availableTools.map(({ _meta, ...rest }) => rest);
    return { tools: sanitizedTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;

    if (!HANDLERS[toolName]) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    const result = await HANDLERS[toolName](
      { token: config.token, parameters: request.params.arguments || {} },
      { domain }
    );

    return { content: result.content, isError: result.isError || false };
  });

  return server;
}

// HTTP server for Smithery container deployment
const app = express();
const PORT = process.env.PORT ?? 8080;

app.use(
  cors({
    origin: ['https://smithery.ai'],
    exposedHeaders: ['mcp-Session-Id', 'mcp-protocol-version'],
    allowedHeaders: ['Authorization', 'Content-Type', 'mcp-session-id'],
  })
);
app.use(express.json());

function getBearerToken(req: Request): string | undefined {
  const authorization = req.header('authorization');

  if (!authorization) {
    return undefined;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function parseConfig(req: Request): Record<string, unknown> {
  const token = getBearerToken(req);

  const domain = req.query.domain;
  return { domain, token };
}

app.all('/mcp', async (req: Request, res: Response) => {
  try {
    const rawConfig = parseConfig(req);
    const config = configSchema.parse(rawConfig);
    const server = createServer({ config });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

async function main() {
  const transport = process.env.TRANSPORT ?? 'stdio';
  if (transport === 'http') {
    app.listen(PORT, () => {
      console.log(`Auth0 MCP HTTP Server listening on port ${PORT}`);
    });
  } else {
    const server = createServer({
      config: configSchema.parse({
        domain: process.env.AUTH0_DOMAIN,
        token: process.env.AUTH0_TOKEN,
      }),
    });
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error('Auth0 MCP Server running in stdio mode');
  }
}

main().catch((error: unknown) => {
  console.error('Server error:', error);
  process.exit(1);
});
