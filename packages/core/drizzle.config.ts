import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

// Use DATABASE_URL from environment or fallback path
const databaseUrl = process.env.DATABASE_URL || 'file:astrolabe.db';

export default defineConfig({
  // Database driver - PGlite uses PostgreSQL dialect
  dialect: 'postgresql',

  // Schema files
  schema: './src/database/schema.ts',

  // Migration output directory
  out: './src/database/migrations',

  // Database configuration for PGlite
  dbCredentials: {
    url: databaseUrl,
  },

  // Additional configuration
  verbose: process.env.DB_VERBOSE === 'true',
  strict: true,

  // Include migration metadata
  migrations: {
    prefix: 'timestamp',
  },
});
