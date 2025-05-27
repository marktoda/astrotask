/**
 * Test setup for MCP Server package
 */
import { vi, beforeEach, afterEach } from 'vitest';

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Restore console in case we need it for debugging
declare global {
  var originalConsole: typeof console;
}

global.originalConsole = originalConsole; 