/**
 * Tests for database URL parsing
 */

import { describe, expect, test } from 'vitest';
import { parseDbUrl, isFileBasedUrl, isServerBased, assertExhaustiveDbUrl } from '../src/database/url-parser.js';

describe('parseDbUrl', () => {
  describe('PostgreSQL URLs', () => {
    test('parses postgresql:// URLs', () => {
      const result = parseDbUrl('postgresql://user:pass@localhost:5432/dbname');
      expect(result.kind).toBe('postgres');
      if (result.kind === 'postgres') {
        expect(result.url.protocol).toBe('postgresql:');
        expect(result.url.hostname).toBe('localhost');
        expect(result.url.port).toBe('5432');
      }
    });

    test('parses postgres:// URLs', () => {
      const result = parseDbUrl('postgres://user:pass@localhost:5432/dbname');
      expect(result.kind).toBe('postgres');
      if (result.kind === 'postgres') {
        expect(result.url.protocol).toBe('postgres:');
      }
    });

    test('parses pg:// URLs', () => {
      const result = parseDbUrl('pg://user:pass@localhost:5432/dbname');
      expect(result.kind).toBe('postgres');
      if (result.kind === 'postgres') {
        expect(result.url.protocol).toBe('pg:');
      }
    });
  });

  describe('SQLite URLs', () => {
    test('parses sqlite:// URLs with path', () => {
      const result = parseDbUrl('sqlite://./data/app.sqlite');
      expect(result.kind).toBe('sqlite-file');
      if (result.kind === 'sqlite-file') {
        expect(result.file).toBe('data/app.sqlite');
      }
    });

    test('parses sqlite:// URLs with absolute path', () => {
      const result = parseDbUrl('sqlite:///absolute/path/to/db.sqlite');
      expect(result.kind).toBe('sqlite-file');
      if (result.kind === 'sqlite-file') {
        expect(result.file).toBe('absolute/path/to/db.sqlite');
      }
    });

    test('throws error for empty SQLite path', () => {
      expect(() => parseDbUrl('sqlite://')).toThrow(
        'SQLite URL must specify a file path: sqlite://path/to/file.db'
      );
    });

    test('parses file paths with .sqlite extension', () => {
      const result = parseDbUrl('./data/app.sqlite');
      expect(result.kind).toBe('sqlite-file');
      if (result.kind === 'sqlite-file') {
        expect(result.file).toBe('./data/app.sqlite');
      }
    });

    test('parses file paths with .sqlite3 extension', () => {
      const result = parseDbUrl('./data/app.sqlite3');
      expect(result.kind).toBe('sqlite-file');
      if (result.kind === 'sqlite-file') {
        expect(result.file).toBe('./data/app.sqlite3');
      }
    });

    test('parses file paths with .db extension', () => {
      const result = parseDbUrl('./data/app.db');
      expect(result.kind).toBe('sqlite-file');
      if (result.kind === 'sqlite-file') {
        expect(result.file).toBe('./data/app.db');
      }
    });
  });

  describe('PGLite memory URLs', () => {
    test('parses memory:// URLs with label', () => {
      const result = parseDbUrl('memory://test-db');
      expect(result.kind).toBe('pglite-mem');
      if (result.kind === 'pglite-mem') {
        expect(result.label).toBe('test-db');
      }
    });

    test('parses memory:// URLs with path-style label', () => {
      const result = parseDbUrl('memory:///test-db');
      expect(result.kind).toBe('pglite-mem');
      if (result.kind === 'pglite-mem') {
        expect(result.label).toBe('test-db');
      }
    });

    test('uses default label for empty memory URL', () => {
      const result = parseDbUrl('memory://');
      expect(result.kind).toBe('pglite-mem');
      if (result.kind === 'pglite-mem') {
        expect(result.label).toBe('default');
      }
    });
  });

  describe('PGLite IndexedDB URLs', () => {
    test('parses idb:// URLs with label', () => {
      const result = parseDbUrl('idb://app-database');
      expect(result.kind).toBe('pglite-idb');
      if (result.kind === 'pglite-idb') {
        expect(result.label).toBe('app-database');
      }
    });

    test('parses idb:// URLs with path-style label', () => {
      const result = parseDbUrl('idb:///app-database');
      expect(result.kind).toBe('pglite-idb');
      if (result.kind === 'pglite-idb') {
        expect(result.label).toBe('app-database');
      }
    });

    test('uses default label for empty idb URL', () => {
      const result = parseDbUrl('idb://');
      expect(result.kind).toBe('pglite-idb');
      if (result.kind === 'pglite-idb') {
        expect(result.label).toBe('default');
      }
    });
  });

  describe('PGLite file paths', () => {
    test('defaults unknown file paths to pglite-file', () => {
      const result = parseDbUrl('./data/custom.astrotask');
      expect(result.kind).toBe('pglite-file');
      if (result.kind === 'pglite-file') {
        expect(result.file).toBe('./data/custom.astrotask');
      }
    });

    test('defaults simple names to pglite-file', () => {
      const result = parseDbUrl('my-database');
      expect(result.kind).toBe('pglite-file');
      if (result.kind === 'pglite-file') {
        expect(result.file).toBe('my-database');
      }
    });
  });

  describe('Error cases', () => {
    test('throws error for empty URL', () => {
      expect(() => parseDbUrl('')).toThrow('Database URL cannot be empty');
    });

    test('throws error for unsupported protocol', () => {
      expect(() => parseDbUrl('redis://localhost:6379')).toThrow(
        'Unsupported database URL protocol: redis:'
      );
    });
  });
});

describe('URL type predicates', () => {
  test('isFileBasedUrl returns true for non-postgres URLs', () => {
    expect(isFileBasedUrl({ kind: 'pglite-file', file: 'test.db' })).toBe(true);
    expect(isFileBasedUrl({ kind: 'pglite-mem', label: 'test' })).toBe(true);
    expect(isFileBasedUrl({ kind: 'pglite-idb', label: 'test' })).toBe(true);
    expect(isFileBasedUrl({ kind: 'sqlite-file', file: 'test.sqlite' })).toBe(true);
  });

  test('isFileBasedUrl returns false for postgres URLs', () => {
    expect(isFileBasedUrl({ kind: 'postgres', url: new URL('postgres://localhost/db') })).toBe(false);
  });

  test('isServerBased returns true only for postgres URLs', () => {
    expect(isServerBased({ kind: 'postgres', url: new URL('postgres://localhost/db') })).toBe(true);
    expect(isServerBased({ kind: 'pglite-file', file: 'test.db' })).toBe(false);
    expect(isServerBased({ kind: 'sqlite-file', file: 'test.sqlite' })).toBe(false);
  });
});

describe('assertExhaustiveDbUrl', () => {
  test('throws error with serialized value', () => {
    expect(() => assertExhaustiveDbUrl({ kind: 'invalid' } as never)).toThrow(
      'Unhandled DbUrl variant: {"kind":"invalid"}'
    );
  });
}); 