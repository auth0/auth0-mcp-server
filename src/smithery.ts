import { startServer } from './server.js';

async function main() {
  await startServer();
}

main().catch((error: unknown) => {
  console.error('Server error:', error);
  process.exit(1);
});
