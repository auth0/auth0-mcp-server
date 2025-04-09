export const AUTH0_SCOPES = [
  'offline_access',
  'create:clients',
  'update:clients',
  'read:clients',
  'read:resource_servers',
  'create:resource_servers',
  'update:resource_servers',
  'read:actions',
  'create:actions',
  'update:actions',
  'read:logs',
  'read:log_streams',
  'read:forms',
  'create:forms',
  'update:forms',
];

export const DEFAULT_SCOPES: string[] = [];

export function getAllScopes(): string[] {
  return AUTH0_SCOPES;
}
