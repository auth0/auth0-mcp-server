import { http, HttpResponse } from 'msw';
import { mockApplications } from './auth0/applications';
import { mockLogs } from './auth0/logs';
import { mockActions, mockActionListResponse } from './auth0/actions';
import { mockForms, mockFormListResponse } from './auth0/forms';
import { mockResourceServers, mockResourceServerListResponse } from './auth0/resource-servers';

// Define handlers for Auth0 API endpoints
export const handlers = [
  // Auth0 Device Authorization Flow
  http.post('https://*/oauth/device/code', async ({ request }) => {
    return HttpResponse.json({
      device_code: 'mock-device-code',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://auth0.com/activate',
      verification_uri_complete: 'https://auth0.com/activate?user_code=ABCD-EFGH',
      expires_in: 900,
      interval: 5,
    });
  }),

  http.post('https://*/oauth/token', async ({ request }) => {
    const body = await request.text();

    // Check if this is a device code exchange
    if (body.includes('device_code')) {
      return HttpResponse.json({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        id_token: 'mock-id-token',
        token_type: 'Bearer',
        expires_in: 86400,
      });
    }

    // Check if this is a refresh token exchange
    if (body.includes('refresh_token')) {
      return HttpResponse.json({
        access_token: 'mock-refreshed-access-token',
        refresh_token: 'mock-new-refresh-token',
        token_type: 'Bearer',
        expires_in: 86400,
      });
    }

    return new HttpResponse(JSON.stringify({ error: 'invalid_request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
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

  // Logs API
  http.get('https://*/api/v2/logs', () => {
    return HttpResponse.json({
      logs: mockLogs,
      total: mockLogs.length,
    });
  }),

  // Actions API
  http.get('https://*/api/v2/actions/actions', ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    // Check for invalid token
    if (authHeader === 'Bearer invalid-token') {
      return new HttpResponse(JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return HttpResponse.json(mockActionListResponse);
  }),

  http.get('https://*/api/v2/actions/actions/:actionId', ({ params }) => {
    const { actionId } = params;
    const action = mockActions.find((a) => a.id === actionId);

    if (!action) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json(action);
  }),

  http.post('https://*/api/v2/actions/actions', async ({ request }) => {
    const newAction = (await request.json()) as Record<string, any>;
    return HttpResponse.json({
      ...newAction,
      id: 'new-action-id',
      status: 'pending',
    });
  }),

  http.patch('https://*/api/v2/actions/actions/:actionId', async ({ params, request }) => {
    const { actionId } = params;
    const updates = (await request.json()) as Record<string, any>;
    const action = mockActions.find((a) => a.id === actionId);

    if (!action) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json({
      ...action,
      ...updates,
    });
  }),

  http.post('https://*/api/v2/actions/actions/:actionId/deploy', ({ params }) => {
    const { actionId } = params;
    const action = mockActions.find((a) => a.id === actionId);

    if (!action) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json({
      ...action,
      status: 'built',
    });
  }),

  // Forms API
  http.get('https://*/api/v2/forms', ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    // Check for invalid token
    if (authHeader === 'Bearer invalid-token') {
      return new HttpResponse(JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return HttpResponse.json(mockFormListResponse);
  }),

  http.get('https://*/api/v2/forms/:formId', ({ params }) => {
    const { formId } = params;
    const form = mockForms.find((f) => f.id === formId);

    if (!form) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json(form);
  }),

  http.post('https://*/api/v2/forms', async ({ request }) => {
    const newForm = (await request.json()) as Record<string, any>;
    return HttpResponse.json({
      ...newForm,
      id: 'new-form-id',
    });
  }),

  http.patch('https://*/api/v2/forms/:formId', async ({ params, request }) => {
    const { formId } = params;
    const updates = (await request.json()) as Record<string, any>;
    const form = mockForms.find((f) => f.id === formId);

    if (!form) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json({
      ...form,
      ...updates,
    });
  }),

  // Resource Servers API
  http.get('https://*/api/v2/resource-servers', ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    // Check for invalid token
    if (authHeader === 'Bearer invalid-token') {
      return new HttpResponse(JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return HttpResponse.json(mockResourceServerListResponse);
  }),

  http.get('https://*/api/v2/resource-servers/:resourceServerId', ({ params }) => {
    const { resourceServerId } = params;
    const resourceServer = mockResourceServers.find((rs) => rs.id === resourceServerId);

    if (!resourceServer) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json(resourceServer);
  }),

  http.post('https://*/api/v2/resource-servers', async ({ request }) => {
    const newResourceServer = (await request.json()) as Record<string, any>;
    return HttpResponse.json({
      ...newResourceServer,
      id: 'new-rs-id',
    });
  }),

  http.patch('https://*/api/v2/resource-servers/:resourceServerId', async ({ params, request }) => {
    const { resourceServerId } = params;
    const updates = (await request.json()) as Record<string, any>;
    const resourceServer = mockResourceServers.find((rs) => rs.id === resourceServerId);

    if (!resourceServer) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json({
      ...resourceServer,
      ...updates,
    });
  }),
];
