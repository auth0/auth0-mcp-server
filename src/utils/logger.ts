import debug from 'debug';

// Set up debug logger
export const log = debug('auth0-mcp');

// Make sure debug output goes to stderr
debug.log = (...args) => {
  const msg = `[DEBUG:auth0-mcp] ${args.join(' ')}\n`;
  process.stderr.write(msg);
  return true;
};

export const logInfo = (...args: any[]) => {
  if (process.env.DEBUG == 'auth0-mcp') {
    return;
  }
  const msg = `[INFO:auth0-mcp] ${args.join(' ')}\n`;
  process.stderr.write(msg);
  return true;
};

/*
export function log(...args: any[]) {
  if (process.env.DEBUG == "auth0-mcp") {
    const msg = `[DEBUG:auth0-mcp-server] ${args.join(' ')}\n`
    process.stderr.write(msg)
  }
}
*/
