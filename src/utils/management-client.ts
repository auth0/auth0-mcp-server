import { ManagementClient } from 'auth0';
import { Auth0Config } from './config.js';

// TODO: Add a way to get the version of the package
const packageVersion = process.env.npm_package_version || '';

export const getManagementClient = async (config: Auth0Config): Promise<ManagementClient> => {
  const mgmtClient = new ManagementClient({
    domain: config.domain,
    token: config.token,
    retry: { maxRetries: 10, enabled: true },
    headers: {
      'User-agent': `auth0-mcp-server/${packageVersion} (node.js/${process.version.replace('v', '')})`,
    },
  });
  return mgmtClient;
};
