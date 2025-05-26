import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config/index.js';

describe('Configuration System', () => {
  it('should load config with default values', () => {
    expect(cfg).toBeDefined();
    expect(cfg.NODE_ENV).toBe('development'); // default from schema
    expect(cfg.PORT).toBe(3000); // default from schema
    expect(cfg.LOG_LEVEL).toBe('info'); // default from schema
  });

  it('should have proper types', () => {
    // These should not throw TypeScript errors
    const env: 'development' | 'production' | 'test' = cfg.NODE_ENV;
    const port: number = cfg.PORT;
    const logLevel: 'debug' | 'info' | 'warn' | 'error' = cfg.LOG_LEVEL;

    expect(typeof env).toBe('string');
    expect(typeof port).toBe('number');
    expect(typeof logLevel).toBe('string');
  });

  it('should handle optional fields properly', () => {
    // These can be undefined
    expect(typeof cfg.DATABASE_URL === 'string' || cfg.DATABASE_URL === undefined).toBe(true);
    expect(typeof cfg.ASTROLABE_DB_KEY === 'string' || cfg.ASTROLABE_DB_KEY === undefined).toBe(true);
  });

  it('should validate enum values', () => {
    expect(['development', 'production', 'test']).toContain(cfg.NODE_ENV);
    expect(['debug', 'info', 'warn', 'error']).toContain(cfg.LOG_LEVEL);
  });

  it('should validate numeric constraints', () => {
    expect(cfg.PORT).toBeGreaterThan(0);
    expect(cfg.PORT).toBeLessThanOrEqual(65535);
    expect(Number.isInteger(cfg.PORT)).toBe(true);
  });
});
