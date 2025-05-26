import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Database driver
  dialect: 'sqlite',
  
  // Schema files
  schema: './src/database/schema.ts',
  
  // Migration output directory
  out: './src/database/migrations',
  
  // Database configuration
  dbCredentials: {
    // Use a development database for migrations
    // The actual encrypted database path is managed by src/database/config.ts
    url: './dev.db',
  },
  
  // Additional configuration
  verbose: true,
  strict: true,
  
  // Include migration metadata
  migrations: {
    prefix: 'timestamp',
  },
}); 