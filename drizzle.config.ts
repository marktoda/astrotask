import { defineConfig } from 'drizzle-kit';
import { cfg } from './src/config/index.js';

export default defineConfig({
  // Database driver
  dialect: 'sqlite',
  
  // Schema files
  schema: './src/database/schema.ts',
  
  // Migration output directory
  out: './src/database/migrations',
  
  // Database configuration
  dbCredentials: {
    // Use the configured database URL
    // For migrations, this will typically be the development database
    url: cfg.DATABASE_URL,
  },
  
  // Additional configuration
  verbose: cfg.DB_VERBOSE,
  strict: true,
  
  // Include migration metadata
  migrations: {
    prefix: 'timestamp',
  },
}); 