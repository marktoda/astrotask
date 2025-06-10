import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './src/database/schema-sqlite.ts',
  out: './migrations/drizzle-sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/astrotask-sqlite.db',
  },
  verbose: true,
  strict: true,
}); 