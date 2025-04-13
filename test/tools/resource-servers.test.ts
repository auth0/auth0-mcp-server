import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { RESOURCE_SERVER_HANDLERS, RESOURCE_SERVER_TOOLS } from '../../src/tools/resource-servers';
import { z } from 'zod';
import { mockConfig } from '../mocks/config';
import {
  mockResourceServers,
  mockResourceServerListResponse,
} from '../mocks/auth0/resource-servers';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe('Resource Servers Tools', () => {
  describe('Resource Servers Schema Validation', () => {
    it('should validate auth0_list_resource_servers parameters correctly', () => {
      const tool = RESOURCE_SERVER_TOOLS.find(
        (tool) => tool.name === 'auth0_list_resource_servers'
      );
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        page: 0,
        per_page: 10,
        include_totals: true,
        identifiers: ['https://api.example.com'],
        include_fields: true,
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Invalid page parameter (string instead of number)
      const invalidPage = {
        page: 'zero',
        per_page: 10,
      };
      const invalidPageResult = schema.safeParse(invalidPage);
      expect(invalidPageResult.success).toBe(false);

      // Invalid identifiers parameter (not an array of strings)
      const invalidIdentifiers = {
        identifiers: 'https://api.example.com',
      };
      const invalidIdentifiersResult = schema.safeParse(invalidIdentifiers);
      expect(invalidIdentifiersResult.success).toBe(false);

      // Empty object should pass (all parameters are optional)
      const emptyParams = {};
      const emptyResult = schema.safeParse(emptyParams);
      expect(emptyResult.success).toBe(true);
    });

    it('should validate auth0_get_resource_server parameters correctly', () => {
      const tool = RESOURCE_SERVER_TOOLS.find((tool) => tool.name === 'auth0_get_resource_server');
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        id: 'resource-server-123',
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Missing required id parameter
      const missingId = {};
      const missingIdResult = schema.safeParse(missingId);
      expect(missingIdResult.success).toBe(false);
    });

    it('should validate auth0_create_resource_server parameters correctly', () => {
      const tool = RESOURCE_SERVER_TOOLS.find(
        (tool) => tool.name === 'auth0_create_resource_server'
      );
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        name: 'Test API',
        identifier: 'https://test-api.example.com',
        scopes: [
          {
            value: 'read:items',
            description: 'Read items',
          },
        ],
        signing_alg: 'RS256',
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Missing required name parameter
      const missingName = {
        identifier: 'https://test-api.example.com',
      };
      const missingNameResult = schema.safeParse(missingName);
      expect(missingNameResult.success).toBe(false);

      // Missing required identifier parameter
      const missingIdentifier = {
        name: 'Test API',
      };
      const missingIdentifierResult = schema.safeParse(missingIdentifier);
      expect(missingIdentifierResult.success).toBe(false);

      // Invalid signing_alg value
      const invalidSigningAlg = {
        name: 'Test API',
        identifier: 'https://test-api.example.com',
        signing_alg: 'invalid_alg',
      };
      const invalidSigningAlgResult = schema.safeParse(invalidSigningAlg);
      expect(invalidSigningAlgResult.success).toBe(false);
    });

    it('should validate auth0_update_resource_server parameters correctly', () => {
      const tool = RESOURCE_SERVER_TOOLS.find(
        (tool) => tool.name === 'auth0_update_resource_server'
      );
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        id: 'resource-server-123',
        name: 'Updated API',
        scopes: [
          {
            value: 'read:users',
            description: 'Read user information',
          },
        ],
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Missing required id parameter
      const missingId = {
        name: 'Updated API',
      };
      const missingIdResult = schema.safeParse(missingId);
      expect(missingIdResult.success).toBe(false);

      // Invalid signing_alg value
      const invalidSigningAlg = {
        id: 'resource-server-123',
        signing_alg: 'invalid_alg',
      };
      const invalidSigningAlgResult = schema.safeParse(invalidSigningAlg);
      expect(invalidSigningAlgResult.success).toBe(false);
    });
  });

  describe('Resource Servers Tool Handlers', () => {
    const domain = mockConfig.domain;
    const token = mockConfig.token;

    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      server.resetHandlers();
    });

    describe('auth0_list_resource_servers', () => {
      it('should return a list of resource servers', async () => {
        const request = {
          token,
          parameters: {},
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_list_resource_servers(
          request,
          config
        );

        expect(response).toBeDefined();
        expect(response.isError).toBe(false);
        expect(response.content).toBeDefined();
        expect(response.content[0].type).toBe('text');

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        expect(parsedContent.resource_servers).toBeDefined();
        expect(parsedContent.resource_servers.length).toBeGreaterThan(0);
      });

      it('should handle pagination parameters', async () => {
        const request = {
          token,
          parameters: {
            page: 1,
            per_page: 5,
            include_totals: true,
            identifiers: ['https://api.example.com'],
            include_fields: true,
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_list_resource_servers(
          request,
          config
        );

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        expect(parsedContent.resource_servers).toBeDefined();
      });

      it('should handle API errors', async () => {
        // Override the handler for this specific test
        server.use(
          http.get('https://*/api/v2/resource-servers', () => {
            return new HttpResponse(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          })
        );

        const request = {
          token: 'invalid-token',
          parameters: {},
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_list_resource_servers(
          request,
          config
        );

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Failed to list resource servers');
        expect(response.content[0].text).toContain('Unauthorized');
      });

      it('should handle missing token', async () => {
        const request = {
          token: '',
          parameters: {},
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_list_resource_servers(
          request,
          config
        );

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Missing authentication token');
      });

      it('should handle missing domain', async () => {
        const request = {
          token,
          parameters: {},
        };

        const config = { domain: '' };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_list_resource_servers(
          request,
          config
        );

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Auth0 domain is not configured');
      });
    });

    describe('auth0_get_resource_server', () => {
      it('should return a single resource server', async () => {
        const resourceServerId = mockResourceServers[0].id;

        const request = {
          token,
          parameters: {
            id: resourceServerId,
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_get_resource_server(request, config);

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        // The response might be nested in a data property or directly in the response
        const resourceData = parsedContent.data || parsedContent;
        expect(resourceData.id).toBe(resourceServerId);
      });

      it('should handle missing id parameter', async () => {
        const request = {
          token,
          parameters: {},
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_get_resource_server(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('id is required');
      });

      it('should handle resource server not found', async () => {
        // Override the handler for this specific test
        server.use(
          http.get('https://*/api/v2/resource-servers/non-existent-id', () => {
            return new HttpResponse(null, { status: 404 });
          })
        );

        const request = {
          token,
          parameters: {
            id: 'non-existent-id',
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_get_resource_server(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('not found');
      });
    });

    describe('auth0_create_resource_server', () => {
      it('should create a new resource server', async () => {
        const request = {
          token,
          parameters: {
            name: 'Test API',
            identifier: 'https://test-api.example.com',
            scopes: [
              {
                value: 'read:items',
                description: 'Read items',
              },
            ],
            signing_alg: 'RS256',
            token_lifetime: 7200,
            allow_offline_access: true,
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_create_resource_server(
          request,
          config
        );

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        // The response might be nested in a data property or directly in the response
        const resourceData = parsedContent.data || parsedContent;
        expect(resourceData.name).toBe('Test API');
        expect(resourceData.identifier).toBe('https://test-api.example.com');
        expect(resourceData.id).toBeDefined();
      });

      it('should handle missing required parameters', async () => {
        const request = {
          token,
          parameters: {
            // Missing name
            identifier: 'https://test-api.example.com',
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_create_resource_server(
          request,
          config
        );

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('name is required');
      });

      it('should handle missing identifier parameter', async () => {
        const request = {
          token,
          parameters: {
            name: 'Test API',
            // Missing identifier
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_create_resource_server(
          request,
          config
        );

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('identifier is required');
      });

      it('should handle API errors', async () => {
        // Override the handler for this specific test
        server.use(
          http.post('https://*/api/v2/resource-servers', () => {
            return new HttpResponse(
              JSON.stringify({
                error: 'Conflict',
                message: 'Resource server with identifier already exists',
              }),
              {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          })
        );

        const request = {
          token,
          parameters: {
            name: 'Test API',
            identifier: 'https://api.example.com', // Using an existing identifier
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_create_resource_server(
          request,
          config
        );

        expect(response.isError).toBe(true);
        expect(response.isError).toBe(true);
        // The error message might be different, so we'll just check that it contains the identifier
        expect(response.content[0].text).toContain('https://api.example.com');
      });
    });

    describe('auth0_update_resource_server', () => {
      it('should update an existing resource server', async () => {
        const resourceServerId = mockResourceServers[0].id;

        const request = {
          token,
          parameters: {
            id: resourceServerId,
            name: 'Updated API',
            scopes: [
              {
                value: 'read:users',
                description: 'Read user information',
              },
              {
                value: 'write:users',
                description: 'Modify user information',
              },
              {
                value: 'delete:users',
                description: 'Delete users',
              },
            ],
            token_lifetime: 43200,
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_update_resource_server(
          request,
          config
        );

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        // The response might be nested in a data property or directly in the response
        const resourceData = parsedContent.data || parsedContent;
        expect(resourceData.name).toBe('Updated API');
        expect(resourceData.id).toBe(resourceServerId);
      });

      it('should handle missing id parameter', async () => {
        const request = {
          token,
          parameters: {
            name: 'Updated API',
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_update_resource_server(
          request,
          config
        );

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('id is required');
      });

      it('should handle resource server not found', async () => {
        // Override the handler for this specific test
        server.use(
          http.patch('https://*/api/v2/resource-servers/non-existent-id', () => {
            return new HttpResponse(null, { status: 404 });
          })
        );

        const request = {
          token,
          parameters: {
            id: 'non-existent-id',
            name: 'Updated API',
          },
        };

        const config = { domain };

        const response = await RESOURCE_SERVER_HANDLERS.auth0_update_resource_server(
          request,
          config
        );

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('not found');
      });
    });
  });
});
