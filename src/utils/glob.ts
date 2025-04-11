/**
 * A simple glob pattern matcher that supports * and ? wildcards.
 * This class allows checking if strings match patterns containing wildcards:
 * - * matches any sequence of characters (including empty string)
 * - ? matches exactly one character
 */
export class Glob {
  private readonly pattern: string;

  /**
   * Creates a new glob pattern for matching strings.
   *
   * @param pattern - The glob pattern to use (supports * and ? wildcards)
   * @example
   * // Match all strings starting with 'test'
   * const glob = new Glob('test*');
   *
   * @example
   * // Match 'file.js' or 'file.ts' but not 'file.jsx'
   * const glob = new Glob('file.??');
   */
  constructor(pattern: string) {
    this.pattern = pattern.trim();
  }

  /**
   * Tests if a string matches this glob pattern.
   *
   * @param str - The string to test against the pattern
   * @returns True if the string matches the pattern, false otherwise
   *
   * @example
   * const glob = new Glob('test*');
   * glob.matches('testing');  // Returns true
   * glob.matches('contest');  // Returns false
   *
   * @example
   * const glob = new Glob('file.?s');
   * glob.matches('file.js');  // Returns true
   * glob.matches('file.ts');  // Returns true
   * glob.matches('file.jsx'); // Returns false
   */
  matches(str: string): boolean {
    // Handle null/undefined
    if (str === null || str === undefined) return false;

    const pattern = this.pattern;

    // Empty pattern only matches empty string
    if (pattern === '') return str === '';

    // Global wildcard matches anything
    if (pattern === '*') return true;

    // No wildcards - just do exact match
    if (!pattern.includes('*') && !pattern.includes('?')) {
      return pattern === str;
    }

    // Convert glob pattern to a simple regex
    const regexString = pattern
      // Escape all special regex chars except * and ?
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // Convert * to .*
      .replace(/\*/g, '.*')
      // Convert ? to . (single character)
      .replace(/\?/g, '.');

    // Create regex that matches the entire string
    const regex = new RegExp(`^${regexString}$`);
    return regex.test(str);
  }

  /**
   * Checks if this pattern contains wildcards (* or ?).
   *
   * @returns True if the pattern contains any wildcards
   * @example
   * const glob = new Glob('test*');
   * console.log(glob.hasWildcards());  // Outputs: true
   */
  hasWildcards(): boolean {
    return this.pattern.includes('*') || this.pattern.includes('?');
  }

  /**
   * Returns the original pattern string.
   *
   * @returns The glob pattern as a string
   * @example
   * const glob = new Glob('test*');
   * console.log(glob.toString());  // Outputs: 'test*'
   */
  toString(): string {
    return this.pattern;
  }

  /**
   * Static helper to create a glob and match it in one operation.
   * Useful for one-off pattern matching without keeping the Glob instance.
   *
   * @param str - The string to test against the pattern
   * @param pattern - The glob pattern to use (supports * and ? wildcards)
   * @returns True if the string matches the pattern, false otherwise
   *
   * @example
   * // Check if a string matches a pattern
   * Glob.matches('testing', 'test*');  // Returns true
   *
   * @example
   * // Check if a filename matches a specific pattern
   * Glob.matches('file.js', 'file.?s');  // Returns true
   */
  static matches(str: string, pattern: string): boolean {
    return new Glob(pattern).matches(str);
  }
}
