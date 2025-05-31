import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

// Determine if we're targeting remote/production
const isRemote = process.env.PGHOST && process.env.PGPORT;

// Database configuration based on environment
const getDbConfig = () => {
  // For remote migrations through Electric proxy
  if (isRemote) {
    const host = process.env.PGHOST;
    const port = process.env.PGPORT;
    const password = process.env.PGPASSWORD;
    
    if (!host || !port || !password) {
      throw new Error('Missing required environment variables for remote deployment: PGHOST, PGPORT, PGPASSWORD');
    }
    
    return {
      host,
      port: parseInt(port),
      user: process.env.PGUSER || 'postgres',
      password,
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

  // Migration output directory based on target
  out: isRemote ? './migrations/drizzle-electric' : './migrations/drizzle',

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
