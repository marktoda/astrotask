import { describe, expect, it } from 'vitest';
import { cfg } from '../src/utils/config.js';

describe('Configuration System', () => {
  it('should load config with default values', () => {
    expect(cfg).toBeDefined();
    expect(cfg.NODE_ENV).toBe('test'); // vitest sets NODE_ENV to 'test' in test environment
    expect(cfg.PORT).toBe(3000); // default from schema
    expect(cfg.LOG_LEVEL).toBe('info'); // default from schema
    // DATABASE_URI now dynamically determined - just check it's a string
    expect(typeof cfg.DATABASE_URI).toBe('string');
    expect(cfg.DATABASE_URI).toBeTruthy();
  });

  it('should have proper types', () => {
    // These should not throw TypeScript errors
    const env: 'development' | 'production' | 'test' = cfg.NODE_ENV;
    const port: number = cfg.PORT;
    const logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' = cfg.LOG_LEVEL;
    const databaseUri: string = cfg.DATABASE_URI;

    expect(typeof env).toBe('string');
    expect(typeof port).toBe('number');
    expect(typeof logLevel).toBe('string');
    expect(typeof databaseUri).toBe('string');
  });

  it('should validate enum values', () => {
    expect(['development', 'production', 'test']).toContain(cfg.NODE_ENV);
    expect(['debug', 'info', 'warn', 'error']).toContain(cfg.LOG_LEVEL);
  });

  it('should validate numeric constraints', () => {
    expect(cfg.PORT).toBeGreaterThan(0);
    expect(cfg.PORT).toBeLessThanOrEqual(65535);
    expect(Number.isInteger(cfg.PORT)).toBe(true);
    
    expect(cfg.DB_TIMEOUT).toBeGreaterThanOrEqual(1000);
    expect(Number.isInteger(cfg.DB_TIMEOUT)).toBe(true);
  });

  it('should validate database configuration', () => {
    // DATABASE_URI is now dynamically determined based on git root or fallbacks
    expect(typeof cfg.DATABASE_URI).toBe('string');
    expect(cfg.DATABASE_URI).toBeTruthy();
    // Should end with astrotask.db
    expect(cfg.DATABASE_URI).toMatch(/astrotask\.db$/);
    expect(typeof cfg.DB_VERBOSE).toBe('boolean');
    expect(cfg.DB_VERBOSE).toBe(false); // default
  });
});
