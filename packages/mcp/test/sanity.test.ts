import { describe, it, expect } from 'vitest';

import { TaskMCPServer } from '../server.js';

// A very small smoke test so the MCP package has at least one passing test.
describe('TaskMCPServer', () => {
  it('should be defined', () => {
    expect(TaskMCPServer).toBeDefined();
  });
}); 