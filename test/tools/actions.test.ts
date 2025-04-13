import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { ACTION_HANDLERS, ACTION_TOOLS } from '../../src/tools/actions';
import { z } from 'zod';
import { mockConfig } from '../mocks/config';
import { mockActions, mockActionListResponse } from '../mocks/auth0/actions';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe('Actions Tools', () => {
  describe('Actions Schema Validation', () => {
    it('should validate auth0_list_actions parameters correctly', () => {
      const tool = ACTION_TOOLS.find((tool) => tool.name === 'auth0_list_actions');
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        page: 0,
        per_page: 10,
        include_totals: true,
        trigger_id: 'post-login',
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

      // Empty object should pass (all parameters are optional)
      const emptyParams = {};
      const emptyResult = schema.safeParse(emptyParams);
      expect(emptyResult.success).toBe(true);
    });

    it('should validate auth0_get_action parameters correctly', () => {
      const tool = ACTION_TOOLS.find((tool) => tool.name === 'auth0_get_action');
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        id: 'action-123',
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Missing required id parameter
      const missingId = {};
      const missingIdResult = schema.safeParse(missingId);
      expect(missingIdResult.success).toBe(false);
    });

    it('should validate auth0_create_action parameters correctly', () => {
      const tool = ACTION_TOOLS.find((tool) => tool.name === 'auth0_create_action');
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        name: 'Test Action',
        supported_triggers: [
          {
            id: 'post-login',
            version: 'v2',
          },
        ],
        code: 'exports.onExecutePostLogin = async (event, api) => { console.log("Hello"); };',
        runtime: 'node18',
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Missing required parameters
      const missingRequired = {
        name: 'Test Action',
        // Missing supported_triggers and code
      };
      const missingRequiredResult = schema.safeParse(missingRequired);
      expect(missingRequiredResult.success).toBe(false);

      // Note: runtime is a string field without validation for specific values
      // so any string value will be accepted
    });

    it('should validate auth0_update_action parameters correctly', () => {
      const tool = ACTION_TOOLS.find((tool) => tool.name === 'auth0_update_action');
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        id: 'action-123',
        name: 'Updated Action',
        code: 'exports.onExecutePostLogin = async (event, api) => { console.log("Updated"); };',
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Missing required id parameter
      const missingId = {
        name: 'Updated Action',
      };
      const missingIdResult = schema.safeParse(missingId);
      expect(missingIdResult.success).toBe(false);
    });

    it('should validate auth0_deploy_action parameters correctly', () => {
      const tool = ACTION_TOOLS.find((tool) => tool.name === 'auth0_deploy_action');
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        id: 'action-123',
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Missing required id parameter
      const missingId = {};
      const missingIdResult = schema.safeParse(missingId);
      expect(missingIdResult.success).toBe(false);
    });
  });

  describe('Actions Tool Handlers', () => {
    const domain = mockConfig.domain;
    const token = mockConfig.token;

    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      server.resetHandlers();
    });

    describe('auth0_list_actions', () => {
      it('should return a list of actions', async () => {
        const request = {
          token,
          parameters: {},
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_list_actions(request, config);

        expect(response).toBeDefined();
        expect(response.isError).toBe(false);
        expect(response.content).toBeDefined();
        expect(response.content[0].type).toBe('text');

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        expect(parsedContent.actions).toBeDefined();
        expect(parsedContent.actions.length).toBeGreaterThan(0);
      });

      it('should handle pagination parameters', async () => {
        const request = {
          token,
          parameters: {
            page: 1,
            per_page: 5,
            include_totals: true,
            trigger_id: 'post-login',
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_list_actions(request, config);

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        expect(parsedContent.actions).toBeDefined();
      });

      it('should handle API errors', async () => {
        // Override the handler for this specific test
        server.use(
          http.get('https://*/api/v2/actions/actions', () => {
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

        const response = await ACTION_HANDLERS.auth0_list_actions(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Failed to list actions');
        expect(response.content[0].text).toContain('Unauthorized');
      });

      it('should handle missing token', async () => {
        const request = {
          token: '',
          parameters: {},
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_list_actions(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Missing authentication token');
      });

      it('should handle missing domain', async () => {
        const request = {
          token,
          parameters: {},
        };

        const config = { domain: '' };

        const response = await ACTION_HANDLERS.auth0_list_actions(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Auth0 domain is not configured');
      });
    });

    describe('auth0_get_action', () => {
      it('should return a single action', async () => {
        const actionId = mockActions[0].id;

        const request = {
          token,
          parameters: {
            id: actionId,
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_get_action(request, config);

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        // The response might be nested in a data property or directly in the response
        const actionData = parsedContent.data || parsedContent;
        expect(actionData.id).toBe(actionId);
      });

      it('should handle missing id parameter', async () => {
        const request = {
          token,
          parameters: {},
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_get_action(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('id is required');
      });

      it('should handle action not found', async () => {
        // Override the handler for this specific test
        server.use(
          http.get('https://*/api/v2/actions/actions/non-existent-id', () => {
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

        const response = await ACTION_HANDLERS.auth0_get_action(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('not found');
      });
    });

    describe('auth0_create_action', () => {
      it('should create a new action', async () => {
        const request = {
          token,
          parameters: {
            name: 'Test Action',
            supported_triggers: [
              {
                id: 'post-login',
                version: 'v2',
              },
            ],
            code: 'exports.onExecutePostLogin = async (event, api) => { console.log("Hello"); };',
            runtime: 'node18',
            dependencies: [
              {
                name: 'lodash',
                version: '4.17.21',
              },
            ],
            secrets: [
              {
                name: 'API_KEY',
                value: 'secret-value',
              },
            ],
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_create_action(request, config);

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        // The response might be nested in a data property or directly in the response
        const actionData = parsedContent.data || parsedContent;
        expect(actionData.name).toBe('Test Action');
        expect(actionData.id).toBeDefined();
      });

      it('should handle missing required parameters', async () => {
        const request = {
          token,
          parameters: {
            // Missing name and supported_triggers
            code: 'exports.onExecutePostLogin = async (event, api) => { console.log("Hello"); };',
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_create_action(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('name is required');
      });

      it('should handle missing code parameter', async () => {
        const request = {
          token,
          parameters: {
            name: 'Test Action',
            supported_triggers: [
              {
                id: 'post-login',
                version: 'v2',
              },
            ],
            // Missing code
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_create_action(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('code is required');
      });

      it('should handle API errors', async () => {
        // Override the handler for this specific test
        server.use(
          http.post('https://*/api/v2/actions/actions', () => {
            return new HttpResponse(JSON.stringify({ error: 'Validation Error' }), {
              status: 422,
              headers: { 'Content-Type': 'application/json' },
            });
          })
        );

        const request = {
          token,
          parameters: {
            name: 'Test Action',
            supported_triggers: [
              {
                id: 'post-login',
                version: 'v2',
              },
            ],
            code: 'exports.onExecutePostLogin = async (event, api) => { console.log("Hello"); };',
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_create_action(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Failed to create action');
      });
    });

    describe('auth0_update_action', () => {
      it('should update an existing action', async () => {
        const actionId = mockActions[0].id;

        const request = {
          token,
          parameters: {
            id: actionId,
            name: 'Updated Action',
            code: 'exports.onExecutePostLogin = async (event, api) => { console.log("Updated"); };',
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_update_action(request, config);

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        // The response might be nested in a data property or directly in the response
        const actionData = parsedContent.data || parsedContent;
        expect(actionData.name).toBe('Updated Action');
        expect(actionData.id).toBe(actionId);
      });

      it('should handle missing id parameter', async () => {
        const request = {
          token,
          parameters: {
            name: 'Updated Action',
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_update_action(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('id is required');
      });

      it('should handle action not found', async () => {
        // Override the handler for this specific test
        server.use(
          http.patch('https://*/api/v2/actions/actions/non-existent-id', () => {
            return new HttpResponse(null, { status: 404 });
          })
        );

        const request = {
          token,
          parameters: {
            id: 'non-existent-id',
            name: 'Updated Action',
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_update_action(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('not found');
      });
    });

    describe('auth0_deploy_action', () => {
      it('should deploy an action', async () => {
        const actionId = mockActions[0].id;

        const request = {
          token,
          parameters: {
            id: actionId,
          },
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_deploy_action(request, config);

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        // The response might be nested in a data property or directly in the response
        const actionData = parsedContent.data || parsedContent;
        expect(actionData.id).toBe(actionId);
        expect(actionData.status).toBe('built');
      });

      it('should handle missing id parameter', async () => {
        const request = {
          token,
          parameters: {},
        };

        const config = { domain };

        const response = await ACTION_HANDLERS.auth0_deploy_action(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('id is required');
      });

      it('should handle action not found', async () => {
        // Override the handler for this specific test
        server.use(
          http.post('https://*/api/v2/actions/actions/non-existent-id/deploy', () => {
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

        const response = await ACTION_HANDLERS.auth0_deploy_action(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Failed to deploy action');
      });
    });
  });
});
