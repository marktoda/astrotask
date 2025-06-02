// Basic test suite for Astrolabe
// This ensures our testing framework is properly configured

import { describe, expect, it } from 'vitest';

describe('Astrolabe Basic Tests', () => {
  it('should perform basic arithmetic', () => {
    expect(2 + 2).toBe(4);
  });

  it('should handle string operations', () => {
    const projectName = 'astrotask';
    expect(projectName).toBe('astrotask');
    expect(projectName.length).toBeGreaterThan(0);
  });

  it('should handle async operations', async () => {
    const asyncValue = await Promise.resolve('test-value');
    expect(asyncValue).toBe('test-value');
  });

  it('should validate object properties', () => {
    const config = {
      name: 'astrotask',
      version: '0.1.0',
      description: 'A local-first, MCP-compatible task-navigation platform',
    };

    expect(config).toHaveProperty('name');
    expect(config.name).toBe('astrotask');
    expect(config).toMatchObject({
      name: 'astrotask',
      version: '0.1.0',
    });
  });

  it('should work with arrays', () => {
    const features = ['local-first', 'MCP-compatible', 'task-navigation'];

    expect(features).toHaveLength(3);
    expect(features).toContain('local-first');
    expect(features[0]).toBe('local-first');
  });
}); 
