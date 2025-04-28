import chalk from 'chalk';
import { jwtDecode } from 'jwt-decode';
import readline from 'readline';
import { getAllScopes } from './scopes.js';

/**
 * Interface for JWT token payload
 */
interface TokenPayload {
  aud: string | string[];
}

/**
 * Configuration for the terminal spinner
 */
interface SpinnerConfig {
  frames: string[];
  interval: number;
}

/**
 * Handles terminal interactions, output formatting, spinners, and user input
 */
class Terminal {
  private spinnerInterval: NodeJS.Timeout | null = null;
  private currentMessage: string = '';
  private readonly spinnerConfig: SpinnerConfig = {
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    interval: 80,
  };
  private readonly audiencePath = '/api/v2/';

  /**
   * Writes a message to stdout
   *
   * @param {string} message - The message to output
   * @returns {boolean} - Always returns true
   */
  public output(message: string): boolean {
    process.stdout.write(message);
    return true;
  }

  /**
   * Starts a spinner with the given message
   *
   * @param {string} message - Message to display alongside the spinner
   */
  public startSpinner(message: string): void {
    let frameIndex = 0;
    this.currentMessage = message;

    // Clear any existing spinner
    this.stopSpinnerWithoutMessage();

    // Initial spinner state
    process.stdout.write(`\r${chalk.cyan(this.spinnerConfig.frames[0])} ${message}`);

    this.spinnerInterval = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(this.spinnerConfig.frames[frameIndex])} ${message}`);
      frameIndex = (frameIndex + 1) % this.spinnerConfig.frames.length;
    }, this.spinnerConfig.interval);
  }

  /**
   * Stops the spinner and clears the line without showing a completion message
   */
  private stopSpinnerWithoutMessage(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
      // Clear the spinner line
      process.stdout.write('\r\x1B[K');
    }
  }

  /**
   * Stops the spinner and shows a completion message
   */
  public stopSpinner(): void {
    if (this.spinnerInterval) {
      this.stopSpinnerWithoutMessage();
      this.output(`${chalk.green('✓')} ${this.currentMessage}\n`);
    }
  }

  /**
   * Extracts tenant information from an access token
   *
   * @param {string} accessToken - JWT access token
   * @returns {string} - The tenant hostname
   * @throws {Error} - If tenant extraction fails
   */
  public getTenantFromToken(accessToken: string): string {
    try {
      const payload = jwtDecode<TokenPayload>(accessToken);
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

      for (const aud of audiences) {
        const url = new URL(aud);
        if (url.pathname === this.audiencePath) {
          return url.host;
        }
      }

      throw new Error('No valid audience found in token');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to extract tenant: ${errorMessage}`);
    }
  }

  /**
   * Prompts user for permission to open browser
   *
   * @returns {Promise<boolean>} - Resolves to true when user presses Enter
   */
  public async promptForBrowserPermission(): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise<boolean>((resolve) => {
      rl.question(
        chalk.yellow(`Press Enter to open the browser to log in or ${chalk.cyan('^C')} to quit.\n`),
        () => {
          rl.close();
          resolve(true);
        }
      );
    });
  }

  /**
   * Prompts user to select scopes or uses provided ones
   *
   * @param {string[]} [providedScopes] - Optional pre-selected scopes
   * @returns {Promise<string[]>} - Resolves to array of selected scopes
   */
  public async promptForScopeSelection(providedScopes?: string[]): Promise<string[]> {
    // If providedScopes were specified via --scopes flag, return them directly
    if (providedScopes && providedScopes.length > 0) {
      console.log(chalk.green(`Using provided scopes: ${providedScopes.join(', ')}`));
      return providedScopes;
    }

    const scopeSelector = new ScopeSelector();
    return scopeSelector.selectScopes();
  }
}

/**
 * Handles interactive scope selection in the terminal
 */
class ScopeSelector {
  private allScopes: string[] = [];
  private selectedScopes: Set<string> = new Set();
  private currentIndex = 0;

  /**
   * Creates a new scope selector instance
   */
  constructor() {
    this.allScopes = getAllScopes();
  }

  /**
   * Displays the interactive scope selection UI
   *
   * @returns {Promise<string[]>} - Resolves to an array of selected scopes
   */
  public async selectScopes(): Promise<string[]> {
    // Display header
    console.log(chalk.cyan.bold('\nSelect scopes using spacebar, then press Enter to confirm:'));
    console.log(
      chalk.dim('(Press spacebar to toggle selection, arrows to navigate, Enter when done)')
    );
    console.log();

    // Only add newlines if there are actually scopes to display
    if (this.allScopes.length === 0) {
      console.log(chalk.yellow('No scopes available to select.'));
      return [];
    }

    // Hide cursor
    process.stdout.write('\x1B[?25l');

    // Handle keyboard input
    process.stdin.setRawMode(true);
    process.stdin.resume();

    // Add initial newlines for menu display
    this.allScopes.forEach(() => console.log(''));

    // Display the menu initially
    this.renderMenu();

    return this.handleKeyboardInput();
  }

  /**
   * Sets up event listeners for keyboard input during scope selection
   *
   * @returns {Promise<string[]>} - Resolves to the selected scopes
   */
  private handleKeyboardInput(): Promise<string[]> {
    return new Promise<string[]>((resolve) => {
      process.stdin.on('data', (key) => {
        const keyString = String(key);

        if (this.handleControlKey(keyString, resolve)) {
          return;
        }

        if (keyString === ' ') {
          this.toggleCurrentSelection();
        } else if (keyString.startsWith('\u001B[')) {
          this.handleArrowKeys(keyString);
        }
      });
    });
  }

  /**
   * Handles control keys (Enter, Ctrl+C) during selection
   *
   * @param {string} keyString - The key input string
   * @param {(scopes: string[]) => void} resolve - The promise resolve function
   * @returns {boolean} - True if a control key was handled, false otherwise
   */
  private handleControlKey(keyString: string, resolve: (scopes: string[]) => void): boolean {
    if (keyString === '\r' || keyString === '\n') {
      // Enter key - finish selection
      this.cleanup();
      const result = Array.from(this.selectedScopes);

      if (result.length === 0) {
        console.log(chalk.yellow('No scopes selected.'));
      } else {
        console.log(chalk.green(`Selected scopes: ${result.join(', ')}`));
      }

      resolve(result);
      return true;
    }

    if (keyString === '\u0003') {
      // Ctrl+C - exit
      this.cleanup();
      console.log(chalk.red('Selection cancelled.'));
      process.exit(0);
      return true;
    }

    return false;
  }

  /**
   * Toggles selection of the current scope
   */
  private toggleCurrentSelection(): void {
    const scope = this.allScopes[this.currentIndex];

    if (this.selectedScopes.has(scope)) {
      this.selectedScopes.delete(scope);
    } else {
      this.selectedScopes.add(scope);
    }

    this.renderMenu();
  }

  /**
   * Handles arrow key navigation
   *
   * @param {string} keyString - The key input string
   */
  private handleArrowKeys(keyString: string): void {
    // Simple arrow keys (up/down)
    if (keyString === '\u001B[A') {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
      this.renderMenu();
      return;
    }

    if (keyString === '\u001B[B') {
      this.currentIndex = Math.min(this.allScopes.length - 1, this.currentIndex + 1);
      this.renderMenu();
      return;
    }

    // Handle other arrow key combinations
    const arrowMatch = keyString.match(/\u001B\[(\d+)?([A-D])/);
    if (arrowMatch) {
      const [_, count, direction] = arrowMatch;
      const moveCount = parseInt(count || '1', 10);

      if (direction === 'A') {
        // Up arrow
        this.currentIndex = Math.max(0, this.currentIndex - moveCount);
        this.renderMenu();
      } else if (direction === 'B') {
        // Down arrow
        this.currentIndex = Math.min(this.allScopes.length - 1, this.currentIndex + moveCount);
        this.renderMenu();
      }
    }
  }

  /**
   * Renders the scope selection menu in the terminal
   */
  private renderMenu(): void {
    // Clear previous menu
    process.stdout.write('\r\x1B[K'); // Clear current line

    for (let i = 0; i < this.allScopes.length; i++) {
      process.stdout.write('\x1B[1A\x1B[K'); // Move up and clear line
    }

    // Display each scope with selection indicator
    this.allScopes.forEach((scope, index) => {
      const isSelected = this.selectedScopes.has(scope);
      const isCurrent = index === this.currentIndex;

      process.stdout.write(
        `${isCurrent ? '>' : ' '} ${isSelected ? '[x]' : '[ ]'} ${chalk.green(scope)}\n`
      );
    });
  }

  /**
   * Cleans up terminal state after selection
   */
  private cleanup(): void {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.removeAllListeners('data');
    process.stdout.write('\x1B[?25h'); // Show cursor
    console.log(''); // Add a newline
  }
}

// Create and export the Terminal instance
const terminal = new Terminal();

// Export functions that match the original API
export const cliOutput = (message: string): boolean => terminal.output(message);
export const startSpinner = (message: string): void => terminal.startSpinner(message);
export const stopSpinner = (): void => terminal.stopSpinner();
export const getTenantFromToken = (accessToken: string): string =>
  terminal.getTenantFromToken(accessToken);
export const promptForBrowserPermission = (): Promise<boolean> =>
  terminal.promptForBrowserPermission();
export const promptForScopeSelection = (providedScopes?: string[]): Promise<string[]> =>
  terminal.promptForScopeSelection(providedScopes);

/**
 * Masks a tenant name according to the specified format:
 * - Shows letters before the dash
 * - Shows 3 letters after the dash
 * - Shows the last word after the last dot
 * - Masks everything else with "xxx"
 *
 * Example: "dev-sfhjdfhdgfghhjdfhf.us.auth0.com" becomes "dev-sfh***com"
 *
 * @param tenantName The tenant name to mask
 * @returns The masked tenant name or the original if it doesn't match the expected format
 */
export function maskTenantName(tenantName: string | undefined | null): string {
  if (!tenantName) {
    return 'unknown';
  }

  const dashIndex = tenantName.indexOf('-');
  const lastDotIndex = tenantName.lastIndexOf('.');

  if (dashIndex === -1 || lastDotIndex === -1) {
    return tenantName; // Return as is if format doesn't match expected pattern
  }

  const prefix = tenantName.substring(0, dashIndex);
  const threeAfterDash = tenantName.substring(dashIndex + 1, dashIndex + 4);
  const lastPart = tenantName.substring(lastDotIndex + 1);

  return `${prefix}-${threeAfterDash}***${lastPart}`;
}
