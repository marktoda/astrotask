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
  // 1. Highest precedence: explicit env var override
  if (process.env.DATABASE_URI) {
    return process.env.DATABASE_URI;
  }

  // 2. Git repository root relative to current working directory (if present)
  const gitRoot = findGitRoot();
  if (gitRoot) {
    return join(gitRoot, 'data', 'astrotask.db');
  }

  // 3. Git repository root relative to the location of this file (handles
  //    scenarios where the process is started outside the repo but code lives
  //    inside a checked-out workspace).
  try {
    // import.meta.url is always defined in ESM – convert to file path
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const moduleDir = dirname(
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      new URL('.', import.meta.url).pathname
    );
    const gitFromModule = findGitRoot(moduleDir);
    if (gitFromModule) {
      return join(gitFromModule, 'data', 'astrotask.db');
    }
  } catch {
    // best-effort – ignore failures (e.g. when bundled by webpack)
  }

  // 4. Existing database somewhere up the directory hierarchy (legacy support)
  const existingDb = findExistingDatabase();
  if (existingDb) {
    return existingDb;
  }

  // 5. Fallback to ./data/astrotask.db relative to current directory
  return './data/astrotask.db';
}

/**
 * Resolve the Astrotask project root directory.
 *
 * The resolution order is:
 *   1. `ASTROTASK_PROJECT_ROOT` environment variable (if set **and** exists)
 *   2. Git repository root discovered via {@link findGitRoot}
 *   3. Current working directory
 *
 * @param startDir Directory to start searching from (defaults to `process.cwd()`).
 * @returns Absolute path to the project root.
 */
export function getProjectRoot(startDir: string = process.cwd()): string {
  // 1. Respect explicit override
  const envRoot = process.env.ASTROTASK_PROJECT_ROOT;
  if (envRoot && existsSync(envRoot)) {
    return resolve(envRoot);
  }

  // 2. Try to discover git root
  const gitRoot = findGitRoot(startDir);
  if (gitRoot) {
    return gitRoot;
  }

  // 3. Fallback – use the provided start directory (resolved to absolute path)
  return resolve(startDir);
}
