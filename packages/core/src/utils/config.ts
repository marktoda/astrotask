import { z } from 'zod';
import { loadConfig } from 'zod-config';
import { dotEnvAdapter } from 'zod-config/dotenv-adapter';
import { envAdapter } from 'zod-config/env-adapter';
import { DEFAULT_MODEL_ID } from './models.js';

/**
 * Centralised configuration schema for Astrolabe.
 *
 * All hard-coded defaults belong here – this doubles as live documentation.
 */
export const configSchema = z.object({
  // Runtime environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Application port
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Log verbosity
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database configuration (PGLite)
  // Primary database location - used consistently across all components
  DATABASE_PATH: z.string().default('./data/astrolabe.db'),

  // Database performance and behavior settings
  DB_VERBOSE: z.coerce.boolean().default(false),
  DB_TIMEOUT: z.coerce.number().int().min(1000).default(5000),

  // LLM/AI Configuration
  OPENAI_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default(DEFAULT_MODEL_ID),
});

export type AppConfig = z.infer<typeof configSchema>;

// The resolved configuration object, fully validated & typed.
// Top-level await makes sure that every importer sees a ready-to-use value.
// Since our schema has defaults for required fields, loadConfig will populate them
export const cfg = (await loadConfig({
  schema: configSchema,
  adapters: [
    // Order matters: later adapters win -> env overrides `.env` defaults.
    dotEnvAdapter({ path: '.env', silent: true }), // .env file
    envAdapter(), // process.env
  ],
})) as AppConfig;
