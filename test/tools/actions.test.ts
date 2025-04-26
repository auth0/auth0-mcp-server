import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { ACTION_HANDLERS } from '../../src/tools/actions';
import { mockConfig } from '../mocks/config';
import { mockActions, mockActionListResponse } from '../mocks/auth0/actions';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

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
      expect(response.content[0].text).toContain('Missing authorization token');
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
