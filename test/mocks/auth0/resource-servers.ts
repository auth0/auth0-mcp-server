// Mock Auth0 resource servers data for testing
export const mockResourceServers = [
  {
    id: 'rs1',
    name: 'Test API 1',
    identifier: 'https://api.example.com',
    scopes: [
      {
        value: 'read:users',
        description: 'Read user information',
      },
      {
        value: 'write:users',
        description: 'Modify user information',
      },
    ],
    signing_alg: 'RS256',
    token_lifetime: 86400,
    allow_offline_access: true,
    skip_consent_for_verifiable_first_party_clients: true,
  },
  {
    id: 'rs2',
    name: 'Test API 2',
    identifier: 'https://api2.example.com',
    scopes: [
      {
        value: 'read:data',
        description: 'Read data',
      },
    ],
    signing_alg: 'RS256',
    token_lifetime: 3600,
    allow_offline_access: false,
    skip_consent_for_verifiable_first_party_clients: false,
  },
];

// Mock resource server list response
export const mockResourceServerListResponse = {
  resource_servers: mockResourceServers,
  total: mockResourceServers.length,
  page: 0,
  per_page: 10,
};

// Mock single resource server response
export const mockSingleResourceServer = mockResourceServers[0];

// Mock create resource server response
export const mockCreateResourceServerResponse = {
  id: 'new-rs-id',
  name: 'New Test API',
  identifier: 'https://new-api.example.com',
  scopes: [
    {
      value: 'read:items',
      description: 'Read items',
    },
  ],
  signing_alg: 'RS256',
  token_lifetime: 7200,
  allow_offline_access: true,
  skip_consent_for_verifiable_first_party_clients: true,
};

// Mock update resource server response
export const mockUpdateResourceServerResponse = {
  ...mockResourceServers[0],
  name: 'Updated Test API',
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
};
