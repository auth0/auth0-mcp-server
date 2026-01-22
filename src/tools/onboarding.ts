import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import type { Auth0Config } from '../utils/config.js';
import { getManagementClient } from '../utils/auth0-client.js';
import type { ClientCreate } from 'auth0';

/**
 * Supported frameworks for SDK integration
 */
type SupportedFramework = 'react' | 'vue' | 'angular' | 'next' | 'express';

/**
 * Onboarding tool definition
 *
 * This tool provides a guided onboarding experience for creating and configuring
 * Auth0 applications. It can work in two modes:
 *
 * 1. Interactive mode: When called without parameters, returns guidance on what info is needed
 * 2. Automated mode: When called with all required parameters, executes the full onboarding flow
 */
export const ONBOARDING_TOOLS: Tool[] = [
  {
    name: 'auth0_onboarding',
    description:
      'Guide users through creating and configuring a new Auth0 application with SDK integration. ' +
      'Supports both interactive mode (no parameters) and automated mode (all parameters provided). ' +
      'Currently supports React framework for SDK integration guides.',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: {
          type: 'string',
          description:
            'Name of the application to create (e.g., "My React App", "Customer Portal")',
        },
        app_type: {
          type: 'string',
          enum: ['spa', 'native', 'regular_web', 'non_interactive'],
          description:
            'Type of application: spa (Single Page App), native (Mobile), regular_web (Server-side), non_interactive (M2M)',
        },
        framework: {
          type: 'string',
          enum: ['react', 'vue', 'angular', 'next', 'express'],
          description:
            'Framework/technology being used. Currently only "react" is fully supported with integration guides.',
        },
        callback_urls: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Callback URLs for authentication redirects (e.g., ["http://localhost:3000/callback", "https://example.com/callback"])',
        },
        logout_urls: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Logout redirect URLs (e.g., ["http://localhost:3000", "https://example.com"])',
        },
        allowed_origins: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Allowed origins for CORS (e.g., ["http://localhost:3000", "https://example.com"]) - Required for SPA apps',
        },
        web_origins: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Allowed web origins for silent authentication (e.g., ["http://localhost:3000", "https://example.com"])',
        },
      },
      // No required fields - supports interactive mode when called without parameters
    },
    _meta: {
      requiredScopes: ['create:clients', 'update:clients'],
    },
    annotations: {
      title: 'Auth0 Onboarding Assistant',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

/**
 * Helper function to generate React SDK integration guide
 */
function generateReactIntegrationGuide(
  domain: string,
  clientId: string,
  callbackUrls: string[],
  logoutUrls: string[]
): string {
  const primaryCallback = callbackUrls[0] || 'http://localhost:3000/callback';
  const primaryLogout = logoutUrls[0] || 'http://localhost:3000';

  return `# 🎉 Auth0 Application Created Successfully!

Your Auth0 application is now configured and ready to integrate with your React app.

## 📋 Application Credentials

**Domain:** ${domain}
**Client ID:** ${clientId}
**Callback URLs:** ${callbackUrls.join(', ')}
**Logout URLs:** ${logoutUrls.join(', ')}

---

## 🚀 React SDK Integration Guide

Follow these steps to integrate Auth0 into your React application:

### Step 1: Install the Auth0 React SDK

\`\`\`bash
npm install @auth0/auth0-react
\`\`\`

### Step 2: Create Environment Variables

Create a \`.env\` file in your project root:

\`\`\`env
REACT_APP_AUTH0_DOMAIN=${domain}
REACT_APP_AUTH0_CLIENT_ID=${clientId}
REACT_APP_AUTH0_CALLBACK_URL=${primaryCallback}
REACT_APP_AUTH0_LOGOUT_URL=${primaryLogout}
\`\`\`

**⚠️ Important:** Add \`.env\` to your \`.gitignore\` file to keep credentials secure!

### Step 3: Configure Auth0Provider

Wrap your app with the Auth0Provider in \`src/index.js\` or \`src/index.tsx\`:

\`\`\`javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <Auth0Provider
      domain="${domain}"
      clientId="${clientId}"
      authorizationParams={{
        redirect_uri: "${primaryCallback}"
      }}
    >
      <App />
    </Auth0Provider>
  </React.StrictMode>
);
\`\`\`

### Step 4: Create Authentication Components

#### Login Button (\`src/components/LoginButton.js\`)

\`\`\`javascript
import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';

export const LoginButton = () => {
  const { loginWithRedirect } = useAuth0();

  return (
    <button onClick={() => loginWithRedirect()}>
      Log In
    </button>
  );
};
\`\`\`

#### Logout Button (\`src/components/LogoutButton.js\`)

\`\`\`javascript
import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';

export const LogoutButton = () => {
  const { logout } = useAuth0();

  return (
    <button onClick={() => logout({
      logoutParams: { returnTo: "${primaryLogout}" }
    })}>
      Log Out
    </button>
  );
};
\`\`\`

#### User Profile (\`src/components/Profile.js\`)

\`\`\`javascript
import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';

export const Profile = () => {
  const { user, isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please log in to see your profile</div>;
  }

  return (
    <div>
      <img src={user.picture} alt={user.name} style={{ borderRadius: '50%', width: '50px' }} />
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
};
\`\`\`

### Step 5: Update Your App Component

Update your \`src/App.js\` or \`src/App.tsx\`:

\`\`\`javascript
import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { LoginButton } from './components/LoginButton';
import { LogoutButton } from './components/LogoutButton';
import { Profile } from './components/Profile';
import './App.css';

function App() {
  const { isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>My Auth0 React App</h1>
        {!isAuthenticated ? (
          <LoginButton />
        ) : (
          <>
            <Profile />
            <LogoutButton />
          </>
        )}
      </header>
    </div>
  );
}

export default App;
\`\`\`

### Step 6: Test Your Integration

1. Start your development server:
   \`\`\`bash
   npm start
   \`\`\`

2. Navigate to \`http://localhost:3000\`
3. Click "Log In" - you'll be redirected to Auth0
4. After logging in, you'll be redirected back to your app
5. Your profile information should be displayed

---

## 🎯 Next Steps

Now that your Auth0 integration is working, you can:

1. **Add Protected Routes** - Use \`withAuthenticationRequired\` HOC to protect routes
2. **Call APIs** - Get access tokens to call protected APIs
3. **Customize Login** - Brand your login page in the Auth0 Dashboard
4. **Add Social Logins** - Enable Google, GitHub, or other providers
5. **Set Up MFA** - Add multi-factor authentication for extra security

## 🔧 Troubleshooting

**Redirect loop:**
- Verify callback URL matches exactly what's configured in Auth0
- Check that domain and client ID are correct

**Login page doesn't open:**
- Ensure you're using HTTPS in production
- Check browser console for CORS errors

**User data not showing:**
- Verify scopes include \`openid profile email\`
- Check that the user has completed registration

## 📚 Resources

- [Auth0 React SDK Documentation](https://auth0.com/docs/quickstart/spa/react)
- [useAuth0 Hook Reference](https://auth0.github.io/auth0-react/functions/useAuth0.html)
- [Auth0 Dashboard](https://manage.auth0.com)

Happy coding! 🎉`;
}

/**
 * Helper function to generate interactive guidance
 */
function generateInteractiveGuidance(providedParams: Record<string, any>): string {
  const missingParams: string[] = [];
  const paramGuidance: string[] = [];

  // Check what's missing and provide guidance
  if (!providedParams.app_name) {
    missingParams.push('app_name');
    paramGuidance.push(
      '**Application Name** (app_name)\n' +
        '   - What would you like to name your application?\n' +
        '   - Example: "My React App", "Customer Portal", "Mobile App"'
    );
  }

  if (!providedParams.app_type) {
    missingParams.push('app_type');
    paramGuidance.push(
      '**Application Type** (app_type)\n' +
        '   - What type of application are you building?\n' +
        '   - Options:\n' +
        '     * `spa` - Single Page Application (React, Vue, Angular)\n' +
        '     * `native` - Mobile app (iOS, Android, React Native)\n' +
        '     * `regular_web` - Traditional web app (Node.js, PHP, Python)\n' +
        '     * `non_interactive` - Machine-to-Machine / API'
    );
  }

  if (!providedParams.framework) {
    missingParams.push('framework');
    paramGuidance.push(
      '**Framework** (framework)\n' +
        '   - What technology/framework are you using?\n' +
        '   - Currently supported: `react`\n' +
        '   - Coming soon: vue, angular, next, express\n' +
        '   - Note: Only React provides full integration guides currently'
    );
  }

  if (!providedParams.callback_urls) {
    missingParams.push('callback_urls');
    paramGuidance.push(
      '**Callback URLs** (callback_urls)\n' +
        '   - Where should Auth0 redirect after login?\n' +
        '   - Example: `["http://localhost:3000/callback", "https://example.com/callback"]`\n' +
        '   - For local development: `["http://localhost:3000/callback"]`'
    );
  }

  if (!providedParams.logout_urls) {
    missingParams.push('logout_urls');
    paramGuidance.push(
      '**Logout URLs** (logout_urls)\n' +
        '   - Where should users be redirected after logout?\n' +
        '   - Example: `["http://localhost:3000", "https://example.com"]`\n' +
        '   - Can use the same base URLs as callbacks (without /callback path)'
    );
  }

  if (providedParams.app_type === 'spa' && !providedParams.allowed_origins) {
    missingParams.push('allowed_origins');
    paramGuidance.push(
      '**Allowed Origins** (allowed_origins) - Required for SPA apps\n' +
        '   - What origins should be allowed for CORS?\n' +
        '   - Example: `["http://localhost:3000", "https://example.com"]`\n' +
        '   - Usually the same as your base URLs'
    );
  }

  const response = `# Auth0 Onboarding Assistant

Welcome! I'll help you create and configure your Auth0 application.

## Information Needed

To create your application, I need the following information:

${paramGuidance.join('\n\n')}

---

## Two Ways to Proceed

### Option 1: Provide Parameters (Automated)
Call this tool again with all required parameters:

\`\`\`json
{
  "app_name": "My React App",
  "app_type": "spa",
  "framework": "react",
  "callback_urls": ["http://localhost:3000/callback"],
  "logout_urls": ["http://localhost:3000"],
  "allowed_origins": ["http://localhost:3000"]
}
\`\`\`

### Option 2: Interactive (Step-by-step)
I can guide you through the process interactively. Just tell me the missing information one step at a time, and I'll help you create the application.

---

## What you've provided so far:

${
  Object.keys(providedParams).length > 0
    ? Object.entries(providedParams)
        .map(([key, value]) => `- **${key}**: ${JSON.stringify(value)}`)
        .join('\n')
    : '_No parameters provided yet_'
}

Let me know how you'd like to proceed!`;

  return response;
}

/**
 * Helper function to generate unsupported framework message
 */
function generateUnsupportedFrameworkMessage(
  framework: string,
  domain: string,
  clientId: string
): string {
  return `# ⚠️ Framework Not Yet Supported

Your Auth0 application has been created successfully!

**Domain:** ${domain}
**Client ID:** ${clientId}

However, the **${framework}** framework doesn't have a full integration guide yet. Currently, only **React** is fully supported with detailed SDK integration instructions.

## What's Next?

1. **Check Auth0 Documentation**
   Visit the [Auth0 Quickstarts](https://auth0.com/docs/quickstart) to find integration guides for your framework.

2. **Use Auth0 Dashboard**
   Go to your [Auth0 Dashboard](https://manage.auth0.com) to view your application and access quickstart guides.

3. **Configure URLs**
   You may still need to configure callback URLs, logout URLs, and allowed origins. You can do this via:
   - The Auth0 Dashboard
   - The \`auth0_update_application\` tool with your client_id: \`${clientId}\`

## Coming Soon

We're working on adding integration guides for:
- Vue.js
- Angular
- Next.js
- Express.js
- And more!

Would you like help configuring your application's URLs and settings?`;
}

/**
 * Onboarding tool handler
 */
export const ONBOARDING_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_onboarding: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const {
        app_name,
        app_type,
        framework,
        callback_urls,
        logout_urls,
        allowed_origins,
        web_origins,
      } = request.parameters;

      // Check for token
      if (!request.token) {
        log('Warning: Token is missing');
        return createErrorResponse('Error: Missing authorization token');
      }

      // Check if domain is configured
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }

      // Determine if we have all required information
      const hasMinimumInfo = app_name && app_type && framework;

      // If minimum info is missing, return interactive guidance
      if (!hasMinimumInfo) {
        log('Missing minimum information, returning interactive guidance');
        const guidance = generateInteractiveGuidance(request.parameters);
        return createSuccessResponse({ guidance, mode: 'interactive' });
      }

      // Check if framework is supported
      const supportedFrameworks: SupportedFramework[] = ['react'];
      const isFrameworkSupported = supportedFrameworks.includes(framework as SupportedFramework);

      log(`Starting onboarding for app: ${app_name}, type: ${app_type}, framework: ${framework}`);

      // Step 1: Create the application
      log('Step 1: Creating Auth0 application');

      const clientData: ClientCreate = {
        name: app_name,
        app_type: app_type,
        oidc_conformant: true, // Always use OIDC compliant
      };

      // Add URLs if provided during creation (optional)
      if (callback_urls && callback_urls.length > 0) {
        clientData.callbacks = callback_urls;
      }
      if (logout_urls && logout_urls.length > 0) {
        clientData.allowed_logout_urls = logout_urls;
      }
      if (allowed_origins && allowed_origins.length > 0) {
        clientData.allowed_origins = allowed_origins;
      }
      if (web_origins && web_origins.length > 0) {
        clientData.web_origins = web_origins;
      }

      const managementClientConfig: Auth0Config = {
        domain: config.domain,
        token: request.token,
      };
      const managementClient = await getManagementClient(managementClientConfig);

      let newApplication: any;
      try {
        const { data } = await managementClient.clients.create(clientData);
        newApplication = data;
        log(`Successfully created application with client_id: ${newApplication.client_id}`);
      } catch (createError: any) {
        log('Failed to create application');
        let errorMessage = `Failed to create application: ${createError.message || 'Unknown error'}`;

        if (createError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing create:clients scope.';
        } else if (createError.statusCode === 403) {
          errorMessage +=
            '\nError: Forbidden. Your token might not have the required scopes (create:clients).';
        }

        return createErrorResponse(errorMessage);
      }

      const clientId = newApplication.client_id;
      const domain = config.domain;

      // Step 2: Update with URLs if they weren't provided during creation
      // This step is only needed if URLs need to be added/updated after creation
      const needsUpdate =
        (!clientData.callbacks && callback_urls) ||
        (!clientData.allowed_logout_urls && logout_urls) ||
        (!clientData.allowed_origins && allowed_origins) ||
        (!clientData.web_origins && web_origins);

      if (needsUpdate) {
        log('Step 2: Updating application URLs');

        const updateData: any = {};
        if (callback_urls && !clientData.callbacks) {
          updateData.callbacks = callback_urls;
        }
        if (logout_urls && !clientData.allowed_logout_urls) {
          updateData.allowed_logout_urls = logout_urls;
        }
        if (allowed_origins && !clientData.allowed_origins) {
          updateData.allowed_origins = allowed_origins;
        }
        if (web_origins && !clientData.web_origins) {
          updateData.web_origins = web_origins;
        }

        try {
          await managementClient.clients.update({ client_id: clientId }, updateData);
          log('Successfully updated application URLs');
        } catch {
          log('Warning: Failed to update application URLs, but application was created');
          // Don't fail the whole operation if URL update fails
        }
      }

      // Step 3: Generate SDK integration guide based on framework
      log('Step 3: Generating SDK integration guide');

      let integrationGuide: string;

      if (isFrameworkSupported && framework === 'react') {
        // Generate React-specific integration guide
        const finalCallbackUrls = callback_urls || ['http://localhost:3000/callback'];
        const finalLogoutUrls = logout_urls || ['http://localhost:3000'];

        integrationGuide = generateReactIntegrationGuide(
          domain,
          clientId,
          finalCallbackUrls,
          finalLogoutUrls
        );
      } else {
        // Framework not supported - provide basic info
        integrationGuide = generateUnsupportedFrameworkMessage(framework, domain, clientId);
      }

      log('Onboarding completed successfully');

      return createSuccessResponse({
        success: true,
        application: {
          client_id: clientId,
          name: app_name,
          app_type: app_type,
          domain: domain,
        },
        integration_guide: integrationGuide,
        framework_supported: isFrameworkSupported,
      });
    } catch (error: any) {
      log('Error processing onboarding request');
      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
