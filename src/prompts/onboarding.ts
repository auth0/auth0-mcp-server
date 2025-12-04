import type { Prompt } from '../utils/types';

export const ONBOARDING_PROMPT: Prompt = {
  name: 'auth0_onboarding',
  description:
    'Guide the user through creating and configuring a new Auth0 application with SDK integration',
  arguments: [],
};

/**
 * Generates the React SDK integration prompt with auto-filled environment variables
 */
function generateReactIntegrationPrompt(
  domain: string,
  clientId: string,
  callbackUrls: string[],
  logoutUrls: string[]
): string {
  const primaryCallback = callbackUrls[0] || 'http://localhost:3000/callback';
  const primaryLogout = logoutUrls[0] || 'http://localhost:3000';

  return `# Auth0 React SDK Integration

  You now have a fully configured Auth0 application! Let's integrate it into your React app.

  ## Your Application Credentials

  **Domain:** ${domain}
  **Client ID:** ${clientId}
  **Callback URLs:** ${callbackUrls.join(', ')}
  **Logout URLs:** ${logoutUrls.join(', ')}

  ---

  ## Step 1: Install the Auth0 React SDK

  Run this command in your React project:

  \`\`\`bash
  npm install @auth0/auth0-react
  \`\`\`

  ---

  ## Step 2: Create Environment Variables File

  Create a \`.env\` file in your project root:

  \`\`\`env
  REACT_APP_AUTH0_DOMAIN=${domain}
  REACT_APP_AUTH0_CLIENT_ID=${clientId}
  REACT_APP_AUTH0_CALLBACK_URL=${primaryCallback}
  REACT_APP_AUTH0_LOGOUT_URL=${primaryLogout}
  \`\`\`

  **Important:** Add \`.env\` to your \`.gitignore\` file to keep credentials secure!

  ---

  ## Step 3: Configure Auth0Provider

  Wrap your app with the Auth0Provider. Update your \`src/index.js\` or \`src/index.tsx\`:

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

  ---

  ## Step 4: Add Authentication to Your App

  Create authentication components in your app:

  ### Login Button Component

  \`\`\`javascript
  // src/components/LoginButton.js
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

  ### Logout Button Component

  \`\`\`javascript
  // src/components/LogoutButton.js
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

  ### User Profile Component

  \`\`\`javascript
  // src/components/Profile.js
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

  ---

  ## Step 5: Use the Components in Your App

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

  ---

  ## Step 6: Test Your Integration

  1. Start your React development server:
     \`\`\`bash
     npm start
     \`\`\`

  2. Navigate to \`http://localhost:3000\`
  3. Click the "Log In" button
  4. You should be redirected to Auth0's login page
  5. After logging in, you'll be redirected back to your app
  6. Your profile information should be displayed

  ---

  ## Next Steps

  ✅ Your Auth0 integration is complete! Here are some things you can do next:

  1. **Add Protected Routes** - Use the \`withAuthenticationRequired\` HOC to protect routes
  2. **Call APIs** - Get access tokens to call protected APIs
  3. **Customize Login Page** - Brand your login page in the Auth0 Dashboard
  4. **Enable Social Logins** - Add Google, GitHub, or other social providers
  5. **Set Up MFA** - Add multi-factor authentication for extra security

  ## Troubleshooting

  **Issue: Redirect loop**
  - Check that your callback URL matches exactly what's configured in Auth0
  - Verify the domain and client ID are correct

  **Issue: Login page doesn't open**
  - Make sure you're using HTTPS in production
  - Check browser console for CORS errors

  **Issue: User data not showing**
  - Verify the scopes include \`openid profile email\`
  - Check that the user has completed registration

  ## Documentation Links

  - [Auth0 React SDK Documentation](https://auth0.com/docs/quickstart/spa/react)
  - [useAuth0 Hook Reference](https://auth0.github.io/auth0-react/functions/useAuth0.html)
  - [Auth0 Dashboard](https://manage.auth0.com)

  Happy coding! 🎉`;
}

/**
 * Main onboarding prompt content that orchestrates the flow
 */
export function getOnboardingPromptContent(): string {
  return `# Auth0 Application Onboarding Assistant

  You are an Auth0 onboarding assistant helping users create and configure Auth0 applications. Follow this exact three-step process:

  ---

  ## STEP 1: CREATE APPLICATION

  First, gather the following information from the user:

  1. **Application Name** (required)
     - Ask: "What would you like to name your application?"
     - Example: "My React App", "Customer Portal", etc.

  2. **Application Type** (required)
     - Ask: "What type of application are you building?"
     - Options:
       * **spa** - Single Page Application (React, Vue, Angular)
       * **native** - Mobile app (iOS, Android, React Native)
       * **regular_web** - Traditional web app (Node.js, PHP, Python)
       * **non_interactive** - Machine-to-Machine / API

  3. **Technology/Framework** (required for now, only React is supported)
     - Ask: "What technology/framework are you using?"
     - **IMPORTANT:** Currently, only "React" is supported. If the user selects anything else, politely inform them: "Currently, only React is 
  supported for guided onboarding. React support is coming soon! For now, I can help you create the application, but you'll need to refer to 
  the Auth0 documentation for integration instructions."

  Once you have all three pieces of information:
  - Use the **auth0_create_application** tool with:
    - \`name\`: <user provided name>
    - \`app_type\`: <user selected type>
    - \`oidc_conformant\`: true

  **IMPORTANT:** After creating the application:
  - Save the \`client_id\` from the response
  - Save the \`domain\` from the configuration
  - Save the \`client_secret\` if provided (for non-SPA apps)
  - Confirm to the user: "✅ Application created successfully! Your Client ID is: [client_id]"

  ---

  ## STEP 2: ADD ALLOWED URLs

  Now configure the callback and logout URLs:

  1. **Ask for Callback URLs** (required)
     - Say: "Now let's configure your callback URLs. These are the URLs Auth0 will redirect to after login."
     - Prompt: "What callback URLs would you like to add? (You can provide multiple, separated by commas)"
     - Examples to show:
       * For local development: \`http://localhost:3000/callback\`
       * For production: \`https://example.com/callback\`
     - Parse the user's input into an array of URLs

  2. **Ask for Allowed Web Origins (required)
    - Say: "Let's add your allowed web origin URL. These are URLs that are trusted to start a sign-in or authentication process for your application."
    - Prompt: "What allowed web origin URLs would you like to add? (You can provide multiple, separated by commas)"
    - Default suggestion: "You can use the same as your callback URLs without the /callback path"
    - If user doesn't provide, use the callback URLs without the path (e.g., \`http://localhost:3000\`)

  3. **Ask for Logout URLs** (required)
     - Say: "What about logout URLs? These are where users will be redirected after logging out."
     - Default suggestion: "You can use the same as your callback URLs without the /callback path"
     - If user doesn't provide, use the callback URLs without the path (e.g., \`http://localhost:3000\`)

  4. **For SPA apps, ask for Allowed Origins** (conditional)
     - If \`app_type\` is "spa", also ask: "What origins should be allowed for CORS? (Usually the same as your base URLs)"
     - Default: Same as logout URLs

  Once you have the URLs:
  - Use the **auth0_update_application** tool with:
    - \`client_id\`: <saved from Step 1>
    - \`callbacks\`: [array of callback URLs]
    - \`allowed_logout_urls\`: [array of logout URLs]
    - \`allowed_origins\`: [array of origins] (only for SPAs)

  **IMPORTANT:** Confirm to the user: "✅ URLs configured successfully!"

  ---

  ## STEP 3: PROVIDE SDK INTEGRATION PROMPT

  This is the final step where you provide the complete integration guide.

  **IMPORTANT CHECKS:**
  1. Verify the technology is "React" (the only supported framework currently)
  2. You must have saved from previous steps:
     - \`domain\`
     - \`client_id\`
     - \`callbackUrls\` array
     - \`logoutUrls\` array
     - \`webOrigins\` array

  **Now generate and display the complete React integration prompt:**

  Call the helper function internally (this is pseudocode for what you should do):
  \`\`\`
  generateReactIntegrationPrompt(domain, clientId, callbackUrls, logoutUrls)
  \`\`\`

  The prompt should include:
  - Full environment variable configuration with actual values
  - Step-by-step installation instructions
  - Complete code examples for:
    * Auth0Provider setup with real domain and clientId
    * LoginButton component
    * LogoutButton component
    * Profile component
    * App.js integration example
  - Testing instructions
  - Troubleshooting section
  - Next steps and resources

  ---

  ## IMPORTANT GUIDELINES

  1. **Be Conversational:** Don't just execute steps robotically. Acknowledge the user, explain what you're doing, and confirm each step.

  2. **Handle Errors Gracefully:**
     - If application creation fails, explain the error and ask if they want to try again
     - If URL configuration fails, check the URL format and suggest corrections

  3. **Validate Input:**
     - Application name must not be empty
     - URLs must be valid HTTP/HTTPS URLs
     - App type must be one of the four options

  4. **Security Reminders:**
     - Remind users to keep client_secret secure (if provided)
     - Suggest adding .env to .gitignore
     - Mention HTTPS requirements for production

  5. **Only React for Now:**
     - If user wants Vue, Angular, React Native, or anything else, apologize and explain only React is currently supported
     - Offer to create the application anyway, but they'll need to refer to Auth0 docs for integration

  6. **Show Progress:**
     - Use checkmarks (✅) to show completed steps
     - Number the steps clearly
     - Summarize what's been done and what's next

  ---

  ## Example Interaction Flow

  **You:** "I'll help you set up your Auth0 application! Let's start by creating it."

  **You:** "What would you like to name your application?"

  **User:** "My Awesome App"

  **You:** "Great! What type of application are you building?"
  - spa (Single Page Application)
  - native (Mobile app)
  - regular_web (Traditional web app)
  - non_interactive (Machine-to-Machine)

  **User:** "spa"

  **You:** "Perfect! What technology/framework are you using? (Currently, only React is supported)"

  **User:** "React"

  **You:** "Excellent! Creating your application now..."
  [Calls auth0_create_application]

  **You:** "✅ Application created successfully! Your Client ID is: abc123xyz"

  **You:** "Now let's configure your callback URLs. What URLs should Auth0 redirect to after login? (e.g., http://localhost:3000/callback)"

  **User:** "http://localhost:3000/callback, https://myapp.com/callback"

  **You:** "Great! And where should users be redirected after logout? (Default: http://localhost:3000, https://myapp.com)"

  **User:** "yes, use the defaults"

  **You:** "Perfect! Configuring your URLs now..."
  [Calls auth0_update_application]

  **You:** "✅ URLs configured successfully!"

  **You:** "Now I'll provide you with complete React integration instructions with all your credentials pre-filled..."
  [Displays full integration prompt]

  ---

  ## Ready to Start!

  Begin by greeting the user and asking for the application name. Follow the three steps in order, and be helpful and friendly throughout!`;
}

export const ONBOARDING_PROMPT_DATA = {
  prompt: ONBOARDING_PROMPT,
  getContent: getOnboardingPromptContent,
  generateReactIntegration: generateReactIntegrationPrompt,
};
