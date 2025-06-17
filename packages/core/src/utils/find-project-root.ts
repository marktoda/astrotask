import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Find the git root directory by traversing up from the current directory
 * @param startDir Starting directory (defaults to current working directory)
 * @returns The git root directory path or null if not found
 */
export function findGitRoot(startDir: string = process.cwd()): string | null {
  let currentDir = resolve(startDir);

  // Traverse up the directory tree
  while (currentDir !== dirname(currentDir)) {
    if (existsSync(join(currentDir, '.git'))) {
      return currentDir;
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

/**
 * Find an existing astrotask database file by traversing up from the current directory
 * @param startDir Starting directory (defaults to current working directory)
 * @returns The path to an existing database file or null if not found
 */
export function findExistingDatabase(startDir: string = process.cwd()): string | null {
  let currentDir = resolve(startDir);

  // Common database file locations to check
  const dbPaths = ['data/astrotask.db', 'astrotask.db', '.astrotask/astrotask.db'];

  // Traverse up the directory tree
  while (currentDir !== dirname(currentDir)) {
    for (const dbPath of dbPaths) {
      const fullPath = join(currentDir, dbPath);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

/**
 * Determine the default database URI with intelligent fallback logic
 * @returns The database URI to use
 */
export function getDefaultDatabaseUri(): string {
  // 1. First check if DATABASE_URI env var is already set
  if (process.env.DATABASE_URI) {
    return process.env.DATABASE_URI;
  }

  // 2. Try to find git root and use {git_root}/data/astrotask.db
  const gitRoot = findGitRoot();
  if (gitRoot) {
    return join(gitRoot, 'data', 'astrotask.db');
  }

  // 3. Look for existing database files in parent directories
  const existingDb = findExistingDatabase();
  if (existingDb) {
    return existingDb;
  }

  // 4. Fall back to ./data/astrotask.db in current directory
  return './data/astrotask.db';
}
