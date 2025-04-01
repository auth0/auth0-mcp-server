import { http, HttpResponse } from 'msw';
import { mockApplications } from './auth0/applications';
import { mockResourceServers } from './auth0/resource-servers';
import { mockActions } from './auth0/actions';
import { mockLogs } from './auth0/logs';
import { mockForms } from './auth0/forms';

// Define handlers for Auth0 API endpoints
export const handlers = [
  // Applications API
  http.get('https://*/api/v2/clients', ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    // Check for invalid token
    if (authHeader === 'Bearer invalid-token') {
      return new HttpResponse(JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return HttpResponse.json({
      clients: mockApplications,
      total: mockApplications.length,
      page: 0,
      per_page: 10,
    });
  }),

  http.get('https://*/api/v2/clients/:clientId', ({ params }) => {
    const { clientId } = params;
    const application = mockApplications.find((app) => app.client_id === clientId);

    if (!application) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json(application);
  }),

  http.post('https://*/api/v2/clients', async ({ request }) => {
    const newApp = (await request.json()) as Record<string, any>;
    return HttpResponse.json({
      ...newApp,
      client_id: 'new-app-id',
    });
  }),

  http.patch('https://*/api/v2/clients/:clientId', async ({ params, request }) => {
    const { clientId } = params;
    const updates = (await request.json()) as Record<string, any>;
    const application = mockApplications.find((app) => app.client_id === clientId);

    if (!application) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json({
      ...application,
      ...updates,
    });
  }),

  http.delete('https://*/api/v2/clients/:clientId', ({ params }) => {
    const { clientId } = params;
    const application = mockApplications.find((app) => app.client_id === clientId);

    if (!application) {
      return new HttpResponse(null, { status: 404 });
    }

    return new HttpResponse(null, { status: 204 });
  }),

  // Resource Servers API
  http.get('https://*/api/v2/resource-servers', () => {
    return HttpResponse.json({
      resource_servers: mockResourceServers,
      total: mockResourceServers.length,
      page: 0,
      per_page: 10,
    });
  }),

  // Actions API
  http.get('https://*/api/v2/actions/actions', () => {
    return HttpResponse.json({
      actions: mockActions,
      total: mockActions.length,
    });
  }),

  // Logs API
  http.get('https://*/api/v2/logs', () => {
    return HttpResponse.json({
      logs: mockLogs,
      total: mockLogs.length,
    });
  }),

  // Forms API
  http.get('https://*/api/v2/prompts', () => {
    return HttpResponse.json({
      prompts: mockForms,
    });
  }),
];
