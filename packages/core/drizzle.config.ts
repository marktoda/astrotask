import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

// Determine database adapter from DATABASE_URI
const databaseUrl = process.env.DATABASE_URI || './data/astrotask.db';
const isPostgres = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');
const isSqlite = databaseUrl.startsWith('sqlite://') || !databaseUrl.includes('://');

// Configuration based on adapter type
let config;

if (isPostgres) {
  // PostgreSQL/PGLite configuration
  config = defineConfig({
    schema: './drizzle-schema.ts',
    out: './migrations/drizzle',
    dialect: 'postgresql',
    dbCredentials: {
      url: databaseUrl,
    },
    verbose: true,
    strict: true,
  });
} else if (isSqlite) {
  // SQLite configuration
  const sqliteUrl = databaseUrl.startsWith('sqlite://') 
    ? databaseUrl.replace('sqlite://', '') 
    : databaseUrl;
    
  config = defineConfig({
    schema: './drizzle-schema.ts',
    out: './migrations/drizzle-sqlite',
    dialect: 'sqlite',
    dbCredentials: {
      url: sqliteUrl,
    },
    verbose: true,
    strict: true,
  });
} else {
  throw new Error(`Unsupported database URL format: ${databaseUrl}`);
}

export default config;
