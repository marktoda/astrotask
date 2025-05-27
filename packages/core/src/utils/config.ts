import { z } from 'zod';
import { loadConfig } from 'zod-config';
import { dotEnvAdapter } from 'zod-config/dotenv-adapter';
import { envAdapter } from 'zod-config/env-adapter';

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

  // Database connection string (SQLite file path or URL)
  DATABASE_URL: z.string().default('./dev.db'),

  // Database encryption key (used with SQLCipher)
  ASTROLABE_DB_KEY: z.string().default('TEST'),

  // Database configuration
  DB_ENCRYPTED: z.coerce.boolean().default(true),
  DB_VERBOSE: z.coerce.boolean().default(false),
  DB_TIMEOUT: z.coerce.number().int().min(1000).default(5000),

  // SQLCipher encryption settings
  DB_CIPHER: z.string().default('aes-256-cbc'),
  DB_KDF_ITER: z.coerce.number().int().min(1000).default(4000),
  DB_PAGE_SIZE: z.coerce.number().int().min(512).default(4096),

  // SQLite performance settings
  DB_CACHE_SIZE: z.coerce.number().int().default(-2000), // 2MB cache (negative = KB)
  DB_MMAP_SIZE: z.coerce.number().int().min(0).default(268435456), // 256MB
  DB_JOURNAL_MODE: z.enum(['DELETE', 'TRUNCATE', 'PERSIST', 'MEMORY', 'WAL', 'OFF']).default('WAL'),
  DB_SYNCHRONOUS: z.enum(['OFF', 'NORMAL', 'FULL', 'EXTRA']).default('NORMAL'),

  // Database directory and filename defaults
  DB_DEFAULT_DIR: z.string().default('~/.astrolabe'),
  DB_DEFAULT_NAME: z.string().default('astrolabe.db'),

  // ElectricSQL configuration (optional for local-first operation)
  ELECTRIC_URL: z.string().optional(),
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
