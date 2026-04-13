import { describe, it, expect } from 'vitest';
import { TOOLS, HANDLERS, getTools, getHandlers, ServerMode } from '../src/exports';

describe('exports', () => {
  it('auth0_save_credentials_to_file is marked localOnly in _meta', () => {
    const tool = TOOLS.find((t) => t.name === 'auth0_save_credentials_to_file');
    expect(tool).toBeDefined();
    expect(tool?._meta?.localOnly).toBe(true);
  });

  it('all other tools are not marked localOnly', () => {
    const localOnlyTools = TOOLS.filter(
      (t) => t.name !== 'auth0_save_credentials_to_file' && t._meta?.localOnly
    );
    expect(localOnlyTools).toHaveLength(0);
  });

  it('HANDLERS includes a handler for auth0_save_credentials_to_file', () => {
    expect(typeof HANDLERS['auth0_save_credentials_to_file']).toBe('function');
  });
});

describe('getTools', () => {
  it('returns all tools when called with no options', () => {
    expect(getTools()).toHaveLength(TOOLS.length);
    expect(getTools().some((t) => t.name === 'auth0_save_credentials_to_file')).toBe(true);
  });

  it('StreamableHttp mode excludes local-only tools', () => {
    const tools = getTools({ mode: ServerMode.StreamableHttp });
    expect(tools.some((t) => t.name === 'auth0_save_credentials_to_file')).toBe(false);
    expect(tools).toHaveLength(TOOLS.filter((t) => !t._meta?.localOnly).length);
  });

  it('Stdio mode returns all tools', () => {
    expect(getTools({ mode: ServerMode.Stdio })).toHaveLength(TOOLS.length);
  });
});

describe('getHandlers', () => {
  it('returns all handlers when called with no options', () => {
    const handlers = getHandlers();
    expect(Object.keys(handlers)).toHaveLength(Object.keys(HANDLERS).length);
    expect('auth0_save_credentials_to_file' in handlers).toBe(true);
  });

  it('StreamableHttp mode excludes local-only tool handlers', () => {
    const handlers = getHandlers({ mode: ServerMode.StreamableHttp });
    expect('auth0_save_credentials_to_file' in handlers).toBe(false);
    expect(Object.keys(handlers)).toHaveLength(
      TOOLS.filter((t) => !t._meta?.localOnly).length
    );
  });

  it('Stdio mode returns all handlers', () => {
    const handlers = getHandlers({ mode: ServerMode.Stdio });
    expect(Object.keys(handlers)).toHaveLength(Object.keys(HANDLERS).length);
  });

  it('all returned handlers are functions', () => {
    for (const handler of Object.values(getHandlers({ mode: ServerMode.StreamableHttp }))) {
      expect(typeof handler).toBe('function');
    }
  });
});
