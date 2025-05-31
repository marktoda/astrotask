import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

// Database configuration based on environment
const getDbConfig = () => {
  // For remote migrations through Electric proxy
  if (process.env.PGHOST && process.env.PGPORT) {
    return {
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'electric',
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    };
  }
  
  // For local development with PGlite
  const databaseUrl = process.env.DATABASE_URL || process.env.DRIZZLE_URL || 'file:astrolabe.db';
  return { url: databaseUrl };
};

export default defineConfig({
  // Database driver - PostgreSQL for both PGlite and Electric
  dialect: 'postgresql',

  // Schema files
  schema: './src/database/schema.ts',

  // Migration output directory (standard location)
  out: './drizzle',

  // Database configuration
  dbCredentials: getDbConfig(),

  // Additional configuration
  verbose: process.env.DB_VERBOSE === 'true',
  strict: true,

  // Include migration metadata
  migrations: {
    prefix: 'timestamp',
  },
});
