import chalk from 'chalk';
import { jwtDecode } from 'jwt-decode';
import readline from 'readline';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval: NodeJS.Timeout;
let currentMessage: string;
const audiencePath = '/api/v2/';

export function cliOutput(message: string) {
  process.stdout.write(message);
  return true;
}

export function startSpinner(message: string) {
  let i = 0;
  currentMessage = message;
  // Clear any existing spinner
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
  }
  // Initial spinner state
  process.stdout.write(`\r${chalk.cyan(spinnerFrames[0])} ${message}`);

  spinnerInterval = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(spinnerFrames[i])} ${message}`);
    i = (i + 1) % spinnerFrames.length;
  }, 80);
}

export function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    // Clear the spinner line
    process.stdout.write('\r\x1B[K');
    cliOutput(`${chalk.green('✓')} ${currentMessage}`);
  }
}

interface Payload {
  aud: string[];
}

export function getTenantFromToken(accessToken: string): string {
  try {
    const payload = jwtDecode<{ aud: string | string[] }>(accessToken);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

    for (const aud of audiences) {
      const url = new URL(aud);
      if (url.pathname === audiencePath) {
        return url.host; //.split(".")[0];
      }
    }
    throw new Error('No valid audience found in token');
  } catch (error) {
    throw new Error(`Failed to extract tenant: ${error}`);
  }
}

export async function promptForBrowserPermission(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question(
      chalk.yellow(`Press Enter to open the browser to log in or ${chalk.cyan('^C')} to quit.\n`),
      () => {
        rl.close();
        resolve(true); // Always return true when Enter is pressed
      }
    );
  });
}

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
