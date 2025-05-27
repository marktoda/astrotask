// Test setup for CLI package
import { vi } from 'vitest';

// Mock console methods to avoid noise in test output
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}; 