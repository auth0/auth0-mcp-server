import { TOOLS } from '../tools/index.js';
import type { Tool } from './types.js';

/**
 * Default scopes to be used when no specific scopes are provided.
 * This is an empty array, meaning no scopes are required by default to
 * promote security by default.
 */
export const DEFAULT_SCOPES: string[] = [];

/**
 * Returns a unique list of all required scopes across all tools.
 *
 * @returns {string[]} - An array of unique scopes required by all tools.
 */
export function getAllScopes(): string[] {
  // Use flatMap to extract and flatten all scopes, with empty fallback
  const allScopes = TOOLS.flatMap((tool) => tool._meta?.requiredScopes ?? []);

  // Create unique set from collected scopes
  return [...new Set(allScopes)];
}

/**
 * Returns all tools whose required scopes are fully satisfied by the provided scopes.
 * Tools with no required scopes are always included.
 *
 * @param {string[]} scopes - The set of OAuth scopes available to the caller.
 * @returns {Tool[]} - Tools whose every required scope is present in the provided set.
 */
export function getToolsForScopes(scopes: string[]): Tool[] {
  const scopeSet = new Set(scopes);
  return TOOLS.filter((tool) =>
    (tool._meta?.requiredScopes ?? []).every((scope) => scopeSet.has(scope))
  );
}
