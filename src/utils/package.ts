import { createRequire } from 'module';

// For importing JSON files in ES modules
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

// Export package coordinates
export const packageName = packageJson.name;
export const packageVersion = packageJson.version;
export const packageInfo = packageJson;
