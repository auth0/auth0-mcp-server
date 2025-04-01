// Mock Auth0 logs data for testing
export const mockLogs = [
  {
    log_id: 'log_1',
    date: '2023-01-01T00:00:00.000Z',
    type: 's',
    description: 'Success Login',
    client_id: 'app1',
    client_name: 'Test Application 1',
    ip: '192.168.1.1',
    user_id: 'user_1',
    user_name: 'test.user@example.com',
    details: {
      request: {
        method: 'POST',
        path: '/oauth/token',
      },
      response: {
        statusCode: 200,
      },
    },
  },
  {
    log_id: 'log_2',
    date: '2023-01-02T00:00:00.000Z',
    type: 'f',
    description: 'Failed Login',
    client_id: 'app1',
    client_name: 'Test Application 1',
    ip: '192.168.1.2',
    user_id: 'user_2',
    user_name: 'another.user@example.com',
    details: {
      request: {
        method: 'POST',
        path: '/oauth/token',
      },
      response: {
        statusCode: 401,
      },
    },
  },
  {
    log_id: 'log_3',
    date: '2023-01-03T00:00:00.000Z',
    type: 'sapi',
    description: 'API Operation',
    client_id: 'app2',
    client_name: 'Test Application 2',
    ip: '192.168.1.3',
    user_id: 'user_3',
    user_name: 'admin@example.com',
    details: {
      request: {
        method: 'GET',
        path: '/api/v2/users',
      },
      response: {
        statusCode: 200,
      },
    },
  },
];

// Mock log search response
export const mockLogSearchResponse = {
  logs: mockLogs,
  total: mockLogs.length,
};

// Mock single log response
export const mockSingleLog = mockLogs[0];
