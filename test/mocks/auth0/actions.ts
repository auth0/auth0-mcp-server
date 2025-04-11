// Mock Auth0 actions data for testing
export const mockActions = [
  {
    id: 'action1',
    name: 'Test Action 1',
    supported_triggers: [
      {
        id: 'post-login',
        version: 'v2',
      },
    ],
    code: 'exports.onExecutePostLogin = async (event, api) => { console.log("Hello from action 1"); };',
    runtime: 'node18',
    status: 'built',
    dependencies: [
      {
        name: 'lodash',
        version: '4.17.21',
      },
    ],
    secrets: [
      {
        name: 'API_KEY',
        updated_at: '2023-01-01T00:00:00.000Z',
      },
    ],
  },
  {
    id: 'action2',
    name: 'Test Action 2',
    supported_triggers: [
      {
        id: 'credentials-exchange',
        version: 'v2',
      },
    ],
    code: 'exports.onExecuteCredentialsExchange = async (event, api) => { console.log("Hello from action 2"); };',
    runtime: 'node18',
    status: 'built',
    dependencies: [],
    secrets: [],
  },
];

// Mock action list response
export const mockActionListResponse = {
  actions: mockActions,
  total: mockActions.length,
  page: 0,
  per_page: 10,
};

// Mock single action response
export const mockSingleAction = mockActions[0];

// Mock create action response
export const mockCreateActionResponse = {
  id: 'new-action-id',
  name: 'New Test Action',
  supported_triggers: [
    {
      id: 'post-login',
      version: 'v2',
    },
  ],
  code: 'exports.onExecutePostLogin = async (event, api) => { console.log("Hello from new action"); };',
  runtime: 'node18',
  status: 'pending',
  dependencies: [],
  secrets: [],
};

// Mock update action response
export const mockUpdateActionResponse = {
  ...mockActions[0],
  name: 'Updated Test Action',
  code: 'exports.onExecutePostLogin = async (event, api) => { console.log("Updated action"); };',
};

// Mock deploy action response
export const mockDeployActionResponse = {
  ...mockActions[0],
  status: 'built',
};
