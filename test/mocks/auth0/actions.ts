// Mock Auth0 actions data for testing
export const mockActions = [
  {
    id: 'act_1',
    name: 'Test Action 1',
    supported_triggers: [
      {
        id: 'post-login',
        version: 'v2',
      },
    ],
    code: `
      /**
       * Handler that will be called during the execution of a PostLogin flow.
       *
       * @param {Event} event - Details about the user and the context in which they are logging in.
       * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
       */
      exports.onExecutePostLogin = async (event, api) => {
        console.log('Test Action 1 executed');
      };
    `,
    status: 'built',
    deployed: true,
    runtime: 'node16',
    created_at: '2023-01-01T00:00:00.000Z',
    updated_at: '2023-01-01T00:00:00.000Z',
  },
  {
    id: 'act_2',
    name: 'Test Action 2',
    supported_triggers: [
      {
        id: 'credentials-exchange',
        version: 'v2',
      },
    ],
    code: `
      /**
       * Handler that will be called during the execution of a Client Credentials exchange.
       *
       * @param {Event} event - Details about the token request.
       * @param {CredentialsExchangeAPI} api - Interface whose methods can be used to change the behavior of the client credentials exchange.
       */
      exports.onExecuteCredentialsExchange = async (event, api) => {
        console.log('Test Action 2 executed');
      };
    `,
    status: 'built',
    deployed: true,
    runtime: 'node16',
    created_at: '2023-02-01T00:00:00.000Z',
    updated_at: '2023-02-01T00:00:00.000Z',
  },
];

// Mock single action response
export const mockSingleAction = mockActions[0];

// Mock create action response
export const mockCreateActionResponse = {
  id: 'new-act-id',
  name: 'New Test Action',
  supported_triggers: [
    {
      id: 'post-login',
      version: 'v2',
    },
  ],
  code: `
    /**
     * Handler that will be called during the execution of a PostLogin flow.
     *
     * @param {Event} event - Details about the user and the context in which they are logging in.
     * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
     */
    exports.onExecutePostLogin = async (event, api) => {
      console.log('New Test Action executed');
    };
  `,
  status: 'built',
  deployed: false,
  runtime: 'node16',
  created_at: '2023-03-01T00:00:00.000Z',
  updated_at: '2023-03-01T00:00:00.000Z',
};

// Mock update action response
export const mockUpdateActionResponse = {
  ...mockActions[0],
  name: 'Updated Test Action',
  code: `
    /**
     * Handler that will be called during the execution of a PostLogin flow.
     *
     * @param {Event} event - Details about the user and the context in which they are logging in.
     * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
     */
    exports.onExecutePostLogin = async (event, api) => {
      console.log('Updated Test Action executed');
    };
  `,
  updated_at: '2023-03-15T00:00:00.000Z',
};
