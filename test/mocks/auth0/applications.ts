// Mock Auth0 application data for testing
export const mockApplications = [
  {
    client_id: 'app1',
    name: 'Test Application 1',
    app_type: 'spa',
    description: 'Test application for unit tests',
    callbacks: ['https://example.com/callback'],
    allowed_origins: ['https://example.com'],
  },
  {
    client_id: 'app2',
    name: 'Test Application 2',
    app_type: 'native',
    description: 'Another test application',
    callbacks: ['https://example2.com/callback'],
    allowed_origins: ['https://example2.com'],
  },
];

// Mock single application response
export const mockSingleApplication = mockApplications[0];

// Mock create application response
export const mockCreateApplicationResponse = {
  client_id: 'new-app-id',
  name: 'New Test Application',
  app_type: 'spa',
  description: 'Newly created test application',
  callbacks: ['https://newapp.com/callback'],
  allowed_origins: ['https://newapp.com'],
};

// Mock update application response
export const mockUpdateApplicationResponse = {
  ...mockApplications[0],
  name: 'Updated Test Application',
  description: 'Updated description',
};
