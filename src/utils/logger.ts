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

export const logError = (msg: string, error: any = undefined) => {
  const formattedMsg = `[ERROR:auth0-mcp] ${msg}`;
  if (error) {
    console.error(formattedMsg, error);
  } else {
    console.error(formattedMsg);
  }
  return true;
};
