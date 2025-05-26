import { z } from 'zod';

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
});

export type AppConfig = z.infer<typeof configSchema>;
