import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findGitRoot, findExistingDatabase, getDefaultDatabaseUri } from '../src/utils/find-project-root.js';

describe('Project Root Utilities', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Save original values
    originalCwd = process.cwd();
    originalEnv = process.env.DATABASE_URI;
    
    // Create a temporary test directory structure
    testDir = join(tmpdir(), `astrotask-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    // Clear DATABASE_URI for tests
    delete process.env.DATABASE_URI;
  });

  afterEach(() => {
    // Restore original values
    process.chdir(originalCwd);
    if (originalEnv !== undefined) {
      process.env.DATABASE_URI = originalEnv;
    } else {
      delete process.env.DATABASE_URI;
    }
    
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('findGitRoot', () => {
    it('should find git root when .git directory exists', () => {
      // Create a git structure
      const gitRoot = join(testDir, 'project');
      const subDir = join(gitRoot, 'src', 'utils');
      mkdirSync(join(gitRoot, '.git'), { recursive: true });
      mkdirSync(subDir, { recursive: true });
      
      const result = findGitRoot(subDir);
      expect(result).toBe(gitRoot);
    });

    it('should return null when no git root exists', () => {
      const subDir = join(testDir, 'no-git', 'src');
      mkdirSync(subDir, { recursive: true });
      
      const result = findGitRoot(subDir);
      expect(result).toBe(null);
    });

    it('should find git root from current directory', () => {
      const gitRoot = join(testDir, 'current');
      mkdirSync(join(gitRoot, '.git'), { recursive: true });
      process.chdir(gitRoot);
      
      const result = findGitRoot();
      expect(result).toBe(gitRoot);
    });
  });

  describe('findExistingDatabase', () => {
    it('should find database in data directory', () => {
      const projectDir = join(testDir, 'with-db');
      const dataDir = join(projectDir, 'data');
      const dbPath = join(dataDir, 'astrotask.db');
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(dbPath, '');
      
      const result = findExistingDatabase(projectDir);
      expect(result).toBe(dbPath);
    });

    it('should find database in root directory', () => {
      const projectDir = join(testDir, 'db-in-root');
      const dbPath = join(projectDir, 'astrotask.db');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(dbPath, '');
      
      const result = findExistingDatabase(projectDir);
      expect(result).toBe(dbPath);
    });

    it('should find database in .astrotask directory', () => {
      const projectDir = join(testDir, 'hidden-db');
      const astrotaskDir = join(projectDir, '.astrotask');
      const dbPath = join(astrotaskDir, 'astrotask.db');
      mkdirSync(astrotaskDir, { recursive: true });
      writeFileSync(dbPath, '');
      
      const result = findExistingDatabase(projectDir);
      expect(result).toBe(dbPath);
    });

    it('should find database in parent directory', () => {
      const parentDir = join(testDir, 'parent');
      const childDir = join(parentDir, 'child', 'grandchild');
      const dbPath = join(parentDir, 'data', 'astrotask.db');
      mkdirSync(join(parentDir, 'data'), { recursive: true });
      mkdirSync(childDir, { recursive: true });
      writeFileSync(dbPath, '');
      
      const result = findExistingDatabase(childDir);
      expect(result).toBe(dbPath);
    });

    it('should return null when no database exists', () => {
      const projectDir = join(testDir, 'no-db');
      mkdirSync(projectDir, { recursive: true });
      
      const result = findExistingDatabase(projectDir);
      expect(result).toBe(null);
    });
  });

  describe('getDefaultDatabaseUri', () => {
    it('should respect DATABASE_URI environment variable', () => {
      process.env.DATABASE_URI = '/custom/path/db.sqlite';
      
      const result = getDefaultDatabaseUri();
      expect(result).toBe('/custom/path/db.sqlite');
    });

    it('should use git root when available', () => {
      const gitRoot = join(testDir, 'git-project');
      const subDir = join(gitRoot, 'src');
      mkdirSync(join(gitRoot, '.git'), { recursive: true });
      mkdirSync(subDir, { recursive: true });
      process.chdir(subDir);
      
      const result = getDefaultDatabaseUri();
      expect(result).toBe(join(gitRoot, 'data', 'astrotask.db'));
    });

    it('should use existing database when found', () => {
      const projectDir = join(testDir, 'existing-db');
      const dbPath = join(projectDir, 'data', 'astrotask.db');
      mkdirSync(join(projectDir, 'data'), { recursive: true });
      writeFileSync(dbPath, '');
      process.chdir(projectDir);
      
      const result = getDefaultDatabaseUri();
      expect(result).toBe(dbPath);
    });

    it('should fall back to ./data/astrotask.db', () => {
      const projectDir = join(testDir, 'fallback');
      mkdirSync(projectDir, { recursive: true });
      process.chdir(projectDir);
      
      const result = getDefaultDatabaseUri();
      expect(result).toBe('./data/astrotask.db');
    });

    it('should prioritize git root over existing database', () => {
      // Create a git project with an existing database in a subdirectory
      const gitRoot = join(testDir, 'priority-test');
      const subDir = join(gitRoot, 'packages', 'app');
      const subDbPath = join(subDir, 'data', 'astrotask.db');
      
      mkdirSync(join(gitRoot, '.git'), { recursive: true });
      mkdirSync(join(subDir, 'data'), { recursive: true });
      writeFileSync(subDbPath, '');
      process.chdir(subDir);
      
      const result = getDefaultDatabaseUri();
      // Should use git root, not the existing database in subdirectory
      expect(result).toBe(join(gitRoot, 'data', 'astrotask.db'));
    });
  });
}); 