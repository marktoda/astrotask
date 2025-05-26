import { loadConfig } from 'zod-config';
import { dotEnvAdapter } from 'zod-config/dotenv-adapter';
import { envAdapter } from 'zod-config/env-adapter';
import { configSchema } from './schema.js';
import type { AppConfig } from './schema.js';

// The resolved configuration object, fully validated & typed.
// Top-level await makes sure that every importer sees a ready-to-use value.
// Since our schema has defaults for required fields, loadConfig will populate them
export const cfg = (await loadConfig({
  schema: configSchema,
  adapters: [
    // Order matters: later adapters win -> env overrides `.env` defaults.
    dotEnvAdapter({ path: '.env', silent: true, }), // .env file
    envAdapter(), // process.env
  ],
})) as AppConfig;
