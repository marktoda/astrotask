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
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // CLI mode - when true, reduces logging verbosity for better user experience
  CLI_MODE: z.coerce.boolean().default(false),

  // Database configuration
  // Can be either a file path for PGlite (e.g., './data/astrotask.db')
  // or a PostgreSQL connection string (e.g., 'postgresql://user:pass@host:port/db')
  DATABASE_URI: z.string().default('./data/astrotask.db'),

  // Database performance and behavior settings
  DB_VERBOSE: z.coerce.boolean().default(false),
  DB_TIMEOUT: z.coerce.number().int().min(1000).default(5000),

  // LLM/AI Configuration
  OPENAI_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default(DEFAULT_MODEL_ID),

  // Optional Electric SQL configuration (deprecated)
  ELECTRIC_URL: z.string().optional(),

  // Development
  DEV_SERVER_HOST: z.string().default('localhost'),
  DEV_SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(5173),

  // Service-specific configuration defaults
  // Complexity analysis settings
  COMPLEXITY_THRESHOLD: z.coerce.number().default(7),
  COMPLEXITY_RESEARCH: z.coerce.boolean().default(false),
  COMPLEXITY_BATCH_SIZE: z.coerce.number().int().min(1).default(5),

  // Task expansion settings
  EXPANSION_USE_COMPLEXITY_ANALYSIS: z.coerce.boolean().default(true),
  EXPANSION_RESEARCH: z.coerce.boolean().default(false),
  EXPANSION_COMPLEXITY_THRESHOLD: z.coerce.number().default(7),
  EXPANSION_DEFAULT_SUBTASKS: z.coerce.number().int().min(1).default(3),
  EXPANSION_MAX_SUBTASKS: z.coerce.number().int().min(1).default(10),
  EXPANSION_FORCE_REPLACE: z.coerce.boolean().default(false),
  EXPANSION_CREATE_CONTEXT_SLICES: z.coerce.boolean().default(true),

  // Store settings
  STORE_IS_ENCRYPTED: z.coerce.boolean().default(false), // not implemented yet
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
})) as unknown as AppConfig;

export const TEST_CONFIG = {
  DATABASE_URL: 'memory://test',
} as const;
