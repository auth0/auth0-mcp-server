import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { FORM_HANDLERS } from '../../src/tools/forms';
import { mockConfig } from '../mocks/config';
import { mockForms } from '../mocks/auth0/forms';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe('Forms Tool Handlers', () => {
  const domain = mockConfig.domain;
  const token = mockConfig.token;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('auth0_list_forms', () => {
    it('should return a list of forms', async () => {
      const request = {
        token,
        parameters: {},
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_list_forms(request, config);

      expect(response).toBeDefined();
      expect(response.isError).toBe(false);
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.forms).toBeDefined();
      expect(parsedContent.forms.length).toBeGreaterThan(0);
    });

    it('should handle pagination parameters', async () => {
      const request = {
        token,
        parameters: {
          page: 1,
          per_page: 10,
          include_totals: true,
        },
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_list_forms(request, config);

      expect(response.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.forms).toBeDefined();
    });

    it('should handle API errors', async () => {
      // Override the handler for this specific test
      server.use(
        http.get('https://*/api/v2/forms', () => {
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

      const response = await FORM_HANDLERS.auth0_list_forms(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to list forms');
      expect(response.content[0].text).toContain('Unauthorized');
    });

    it('should handle missing token', async () => {
      const request = {
        token: '',
        parameters: {},
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_list_forms(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Missing authorization token');
    });

    it('should handle missing domain', async () => {
      const request = {
        token,
        parameters: {},
      };

      const config = { domain: '' };

      const response = await FORM_HANDLERS.auth0_list_forms(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Auth0 domain is not configured');
    });
  });

  describe('auth0_get_form', () => {
    it('should return a single form', async () => {
      const formId = mockForms[0].id;

      const request = {
        token,
        parameters: {
          id: formId,
        },
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_get_form(request, config);

      expect(response.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      // The response might be nested in a data property or directly in the response
      const formData = parsedContent.data || parsedContent;
      expect(formData.id).toBe(formId);
    });

    it('should handle missing id parameter', async () => {
      const request = {
        token,
        parameters: {},
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_get_form(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('id is required');
    });

    it('should handle form not found', async () => {
      // Override the handler for this specific test
      server.use(
        http.get('https://*/api/v2/forms/non-existent-id', () => {
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

      const response = await FORM_HANDLERS.auth0_get_form(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });
  });

  describe('auth0_create_form', () => {
    it('should create a new form', async () => {
      const request = {
        token,
        parameters: {
          name: 'Test Form',
          messages: {
            success: 'Form submitted successfully',
          },
          languages: {
            default: 'en',
            supported: ['en'],
          },
          translations: {
            en: {
              title: 'Test Form',
              submit: 'Submit',
            },
          },
          nodes: [
            {
              id: 'node1',
              type: 'text',
              label: 'Name',
              required: true,
            },
          ],
          start: {
            node: 'node1',
          },
          ending: {
            message: 'Thank you',
          },
          style: {
            theme: 'light',
          },
        },
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_create_form(request, config);

      expect(response.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      // The response might be nested in a data property or directly in the response
      const formData = parsedContent.data || parsedContent;
      expect(formData.name).toBe('Test Form');
      expect(formData.id).toBeDefined();
    });

    it('should handle missing required parameters', async () => {
      const request = {
        token,
        parameters: {
          // Missing name
          messages: {
            success: 'Form submitted successfully',
          },
        },
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_create_form(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('name is required');
    });

    it('should handle API errors', async () => {
      // Override the handler for this specific test
      server.use(
        http.post('https://*/api/v2/forms', () => {
          return new HttpResponse(JSON.stringify({ error: 'Validation Error' }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );

      const request = {
        token,
        parameters: {
          name: 'Test Form',
        },
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_create_form(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to create form');
    });
  });

  describe('auth0_update_form', () => {
    it('should update an existing form', async () => {
      const formId = mockForms[0].id;

      const request = {
        token,
        parameters: {
          id: formId,
          name: 'Updated Form',
          messages: {
            success: 'Form updated successfully',
          },
        },
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_update_form(request, config);

      expect(response.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      // The response might be nested in a data property or directly in the response
      const formData = parsedContent.data || parsedContent;
      expect(formData.name).toBe('Updated Form');
      expect(formData.id).toBe(formId);
    });

    it('should handle missing id parameter', async () => {
      const request = {
        token,
        parameters: {
          name: 'Updated Form',
        },
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_update_form(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('id is required');
    });

    it('should handle form not found', async () => {
      // Override the handler for this specific test
      server.use(
        http.patch('https://*/api/v2/forms/non-existent-id', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      const request = {
        token,
        parameters: {
          id: 'non-existent-id',
          name: 'Updated Form',
        },
      };

      const config = { domain };

      const response = await FORM_HANDLERS.auth0_update_form(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });
  });
});
