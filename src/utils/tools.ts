import { Tool } from './types.js';
import { log } from './logger.js';
import { Glob } from './glob.js';

/**
 * Filters the provided tools collection based on specified glob patterns and readOnly flag.
 * This function processes the input patterns against available tools to determine
 * which tools should be returned. It handles special cases like wildcard patterns,
 * empty pattern arrays, and pattern matching errors. When readOnly is true,
 * it only returns tools that have _meta.readOnly set to true or tools that follow read-only patterns.
 *
 * IMPORTANT: The readOnly flag takes priority over pattern matching for security reasons.
 * Even if patterns match non-read-only tools, when readOnly=true is specified,
 * only read-only tools will be returned.
 *
 * @param allTools - Complete collection of available tools to be filtered
 * @param patterns - Optional glob patterns to filter tools by (e.g., 'auth0*', 'jwt-*')
 *                   If omitted or empty, all tools will be returned
 *                   A single '*' pattern will return all tools
 * @param readOnly - Optional flag to only return read-only tools
 *                   When true, only returns tools marked as readOnly
 *                   Takes priority over pattern matching for security
 * @returns Array of Tool objects that match the specified criteria
 *          Returns all tools if no patterns provided or on error
 *
 * @example
 * // Return all tools that start with "auth"
 * const authTools = getAvailableTools(tools, ['auth*']);
 *
 * @example
 * // Return all read-only tools (regardless of pattern matching)
 * const readOnlyTools = getAvailableTools(tools, ['*'], true);
 *
 * @example
 * // Return only read-only tools that match the pattern
 * // Note: --read-only takes priority, so even if the pattern matches non-read-only tools,
 * // only the read-only ones will be returned
 * const readOnlyAuthTools = getAvailableTools(tools, ['auth0_*_application'], true);
 */
export function getAvailableTools(
  allTools: Tool[],
  patterns?: string[],
  readOnly?: boolean
): Tool[] {
  // Start with all tools
  let filteredTools = allTools;

  // Apply pattern filtering if patterns are provided
  if (patterns?.length) {
    filteredTools = filterToolsByPatterns(filteredTools, patterns);
  }

  // Apply read-only filtering if requested
  // IMPORTANT: This is applied AFTER pattern filtering, ensuring that
  // --read-only takes priority over --tools for security
  // Even if non-read-only tools match the pattern, they will be filtered out here
  if (readOnly) {
    filteredTools = filterToolsByReadOnly(filteredTools);
  }

  return filteredTools;
}

function filterToolsByPatterns(tools: Tool[], patterns: string[]): Tool[] {
  try {
    // Special case for global wildcard
    if (patterns.length === 1 && patterns[0] === '*') {
      return tools; // Keep all tools, no pattern filtering needed
    }

    // Compile glob patterns once for performance
    const globs = patterns.map((pattern) => new Glob(pattern));

    // Track matching tools and matches per pattern
    const enabledToolNames = new Set<string>();
    const matchesByPattern = new Map<string, number>();

    // For each tool, check if it matches any pattern
    for (const tool of tools) {
      for (const glob of globs) {
        if (glob.matches(tool.name)) {
          enabledToolNames.add(tool.name);
          // Count matches per pattern for logging
          const patternString = glob.toString();
          matchesByPattern.set(patternString, (matchesByPattern.get(patternString) || 0) + 1);
          // Once we find a match, no need to check other patterns
          break;
        }
      }
    }

    // Log match counts for wildcard patterns for debugging
    for (const [pattern, count] of matchesByPattern.entries()) {
      if (pattern.includes('*')) {
        log(`Glob pattern '${pattern}' matched ${count} tools`);
      }
    }

    // Create the filtered tool list based on patterns
    const filteredTools = tools.filter((tool) => enabledToolNames.has(tool.name));
    log(`Selected ${filteredTools.length} available tools based on patterns`);
    return filteredTools;
  } catch (error) {
    // Log error and use all tools as fallback
    log(
      `Error determining available tools: ${error instanceof Error ? error.message : String(error)}`
    );
    return tools;
  }
}

function filterToolsByReadOnly(tools: Tool[]): Tool[] {
  const readOnlyTools = tools.filter((tool) => tool._meta?.readOnly === true);
  log(`Filtered to ${readOnlyTools.length} read-only tools`);
  return readOnlyTools;
}

/**
 * Validates tool patterns against available tools to ensure each pattern matches at least one tool.
 * This function verifies that each provided pattern (including glob patterns) corresponds to
 * at least one available tool, throwing specific errors for different validation scenarios.
 *
 * @param patterns - Array of tool name patterns to validate
 *                   Can include glob patterns with wildcards (e.g., 'auth0*')
 *                   Empty array or undefined will skip validation
 * @param availableTools - Collection of Tool objects to validate patterns against
 *
 * @throws {Error} If availableTools is not a valid array or is empty
 * @throws {Error} If any pattern doesn't match at least one tool name, with different
 *                 error messages for exact matches vs. wildcard patterns
 *
 * @example
 * // Validate specific tool names
 * validatePatterns(['auth0-jwt', 'auth0-management'], tools);
 *
 * @example
 * // Validate with glob patterns
 * validatePatterns(['auth0*', 'jwt-*'], tools);
 *
 * @see {@link Glob} for the pattern matching implementation
 * @see {@link getAvailableTools} for filtering tools using these patterns
 */
export function validatePatterns(patterns: string[], availableTools: Tool[]): void {
  // Skip validation if patterns array is empty
  if (!patterns || patterns.length === 0) {
    return;
  }

  // Input validation
  if (!availableTools || !Array.isArray(availableTools)) {
    throw new Error('Invalid tools array provided for validation');
  }

  if (availableTools.length === 0) {
    throw new Error('No tools available for pattern validation');
  }

  // Extract tool names for faster matching
  const toolNames = availableTools.map((tool) => tool.name);

  // Validate each pattern
  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    const matchesAnyTool = toolNames.some((name) => glob.matches(name));

    if (!matchesAnyTool) {
      const errorPrefix = pattern.includes('*') ? `No tools match the pattern` : `Invalid tool`;
      throw new Error(`${errorPrefix}: ${pattern}. Accepted tools are: ${toolNames.join(', ')}`);
    }
  }
}
