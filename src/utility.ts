import chalk from 'chalk';
import { jwtDecode } from 'jwt-decode';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval: NodeJS.Timeout;
let currentMessage: string;
const audiencePath = '/api/v2/';

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
    console.log(`${chalk.green('✓')} ${currentMessage}`);
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
