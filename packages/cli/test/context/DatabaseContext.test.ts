import { describe, it, expect } from 'vitest';
import React from 'react';
import { DatabaseContext } from '../../source/context/DatabaseContext.js';

describe('DatabaseContext', () => {
  it('should create context', () => {
    expect(DatabaseContext).toBeDefined();
  });

  it('should be a React context with Provider and Consumer', () => {
    expect(DatabaseContext.Provider).toBeDefined();
    expect(DatabaseContext.Consumer).toBeDefined();
    expect(typeof DatabaseContext.Provider).toBe('object');
    expect(typeof DatabaseContext.Consumer).toBe('object');
  });
}); 