// Mock Auth0 resource server data for testing
export const mockResourceServers = [
  {
    id: 'rs1',
    name: 'Test API 1',
    identifier: 'https://api.example.com',
    scopes: [
      {
        value: 'read:data',
        description: 'Read data',
      },
      {
        value: 'write:data',
        description: 'Write data',
      },
    ],
    token_lifetime: 86400,
    signing_alg: 'RS256',
  },
  {
    id: 'rs2',
    name: 'Test API 2',
    identifier: 'https://api2.example.com',
    scopes: [
      {
        value: 'read:users',
        description: 'Read users',
      },
      {
        value: 'write:users',
        description: 'Write users',
      },
    ],
    token_lifetime: 3600,
    signing_alg: 'RS256',
  },
];

// Mock single resource server response
export const mockSingleResourceServer = mockResourceServers[0];

// Mock create resource server response
export const mockCreateResourceServerResponse = {
  id: 'new-rs-id',
  name: 'New Test API',
  identifier: 'https://newapi.example.com',
  scopes: [
    {
      value: 'read:items',
      description: 'Read items',
    },
    {
      value: 'write:items',
      description: 'Write items',
    },
  ],
  token_lifetime: 86400,
  signing_alg: 'RS256',
};

// Mock update resource server response
export const mockUpdateResourceServerResponse = {
  ...mockResourceServers[0],
  name: 'Updated Test API',
  scopes: [
    ...mockResourceServers[0].scopes,
    {
      value: 'delete:data',
      description: 'Delete data',
    },
  ],
};
