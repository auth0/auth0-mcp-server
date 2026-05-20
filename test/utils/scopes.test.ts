import { describe, it, expect } from 'vitest';
import { getAllScopes, getToolsForScopes } from '../../src/utils/scopes.js';
import { TOOLS } from '../../src/tools/index.js';

describe('getAllScopes', () => {
  it('returns a non-empty list of unique scopes', () => {
    const scopes = getAllScopes();
    expect(scopes.length).toBeGreaterThan(0);
    expect(new Set(scopes).size).toBe(scopes.length);
  });

  it('includes known Auth0 scopes', () => {
    const scopes = getAllScopes();
    expect(scopes).toContain('read:clients');
    expect(scopes).toContain('read:logs');
  });
});

describe('getToolsForScopes', () => {
  it('returns tools when all required scopes are satisfied', () => {
    const tools = getToolsForScopes(['read:clients']);
    expect(tools.some((t) => t.name === 'auth0_list_applications')).toBe(true);
  });

  it('excludes tools whose required scopes are not satisfied', () => {
    const tools = getToolsForScopes(['read:logs']);
    expect(tools.some((t) => t.name === 'auth0_create_application')).toBe(false);
  });

  it('excludes tools without declared requiredScopes (fail-closed)', () => {
    const toolsWithScopes = TOOLS.filter(
      (t) => t._meta?.requiredScopes && t._meta.requiredScopes.length > 0
    );
    expect(getToolsForScopes(getAllScopes())).toHaveLength(toolsWithScopes.length);
  });

  it('returns no tools when scopes list is empty', () => {
    expect(getToolsForScopes([])).toHaveLength(0);
  });

  it('all returned tools have every required scope in the provided set', () => {
    const granted = ['read:clients', 'read:logs'];
    const grantedSet = new Set(granted);
    for (const tool of getToolsForScopes(granted)) {
      for (const scope of tool._meta!.requiredScopes!) {
        expect(grantedSet.has(scope)).toBe(true);
      }
    }
  });
});
