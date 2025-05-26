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

  // TODO: make required
  // Database connection string (optional because some environments might not require it)
  DATABASE_URL: z.string().url().optional(),

  // Database encryption key (optional, will use default if not provided)
  ASTROLABE_DB_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;
