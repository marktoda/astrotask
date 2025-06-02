import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

// Use the unified DATABASE_URI configuration
const databaseUrl = process.env.DATABASE_URI || './data/astrolabe.db';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './migrations/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
