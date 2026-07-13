import { describe, it, expect } from 'vitest';
import { resolvePlaceholders } from '../../src/utils/quickstart-placeholders';

describe('resolvePlaceholders', () => {
  const placeholders = {
    '%AUTH0_DOMAIN%': { inputKey: 'auth0Domain' },
    '%AUTH0_CLIENT_ID%': { inputKey: 'auth0ClientId' },
    '%PORT%': { inputKey: 'port' },
    '%APP_SCHEME%': { inputKey: 'appScheme' },
    '%APP_DOMAIN%': { inputKey: 'appDomain' },
    '%SDK_VERSION%': '2.x',
    '%GIT_REMOTE%': { environmentKey: 'gitRemote' },
    '%GIT_BRANCH%': { environmentKey: 'gitBranch' },
    '{import.meta.env.VITE_AUTH0_DOMAIN}': { inputKey: 'auth0Domain', prefix: '"', suffix: '"' },
  };

  const inputValues = {
    auth0Domain: 'tenant.auth0.com',
    auth0ClientId: 'abc123',
    port: '5173',
    appDomain: 'localhost',
    appScheme: 'http',
  };

  const environment = {
    gitRemote: 'https://github.com/auth0-samples/auth0-react-samples',
    gitBranch: 'quickstart/login',
  };

  it('should resolve inputKey placeholders', () => {
    const result = resolvePlaceholders(
      'Domain: %AUTH0_DOMAIN%, ID: %AUTH0_CLIENT_ID%',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe('Domain: tenant.auth0.com, ID: abc123');
  });

  it('should resolve static string placeholders', () => {
    const result = resolvePlaceholders(
      'npm install @auth0/auth0-react@%SDK_VERSION%',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe('npm install @auth0/auth0-react@2.x');
  });

  it('should resolve environmentKey placeholders', () => {
    const result = resolvePlaceholders(
      'git clone -b %GIT_BRANCH% %GIT_REMOTE%',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe(
      'git clone -b quickstart/login https://github.com/auth0-samples/auth0-react-samples'
    );
  });

  it('should apply prefix and suffix wrapping', () => {
    const result = resolvePlaceholders(
      'domain={import.meta.env.VITE_AUTH0_DOMAIN}',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe('domain="tenant.auth0.com"');
  });

  it('should leave unresolvable placeholders unchanged', () => {
    const result = resolvePlaceholders(
      'Value: %UNKNOWN%',
      { '%UNKNOWN%': { inputKey: 'nonexistent' } },
      inputValues,
      environment
    );
    expect(result).toBe('Value: %UNKNOWN%');
  });

  it('should handle prompts with no matching placeholders', () => {
    const result = resolvePlaceholders(
      'No placeholders here',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe('No placeholders here');
  });

  it('should handle multiple occurrences of the same placeholder', () => {
    const result = resolvePlaceholders('%PORT% and %PORT%', placeholders, inputValues, environment);
    expect(result).toBe('5173 and 5173');
  });

  it('should handle empty placeholders map', () => {
    const result = resolvePlaceholders('%PORT%', {}, inputValues, environment);
    expect(result).toBe('%PORT%');
  });

  it('should handle empty string prompt', () => {
    const result = resolvePlaceholders('', placeholders, inputValues, environment);
    expect(result).toBe('');
  });

  it('should not recursively expand values containing placeholder syntax', () => {
    const result = resolvePlaceholders(
      'Domain: %AUTH0_DOMAIN%',
      { '%AUTH0_DOMAIN%': { inputKey: 'auth0Domain' } },
      { auth0Domain: '%PORT%' },
      environment
    );
    expect(result).toBe('Domain: %PORT%');
  });

  it('should leave placeholder unchanged when environmentKey is missing', () => {
    const result = resolvePlaceholders(
      'URL: %DOWNLOAD_URL%',
      { '%DOWNLOAD_URL%': { environmentKey: 'downloadUrl' } },
      inputValues,
      {}
    );
    expect(result).toBe('URL: %DOWNLOAD_URL%');
  });
});
