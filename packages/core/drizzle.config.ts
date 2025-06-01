import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

// Local development with PGlite
const databaseUrl = process.env.DATABASE_URL || process.env.DRIZZLE_URL || 'file:astrolabe.db';

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
