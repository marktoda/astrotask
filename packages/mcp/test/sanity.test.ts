import { describe, it, expect } from 'vitest';

import { TaskHandlers } from '../src/handlers/TaskHandlers.js';

// A very small smoke test so the MCP package has at least one passing test.
describe('MCP Package Sanity', () => {
  it('should have TaskHandlers defined', () => {
    expect(TaskHandlers).toBeDefined();
  });

  it('should be able to create TaskHandlers instance', () => {
    const mockContext = {
      store: {} as any,
      taskService: {} as any,
      requestId: 'test',
      timestamp: '2024-01-01T00:00:00.000Z'
    };
    
    const handlers = new TaskHandlers(mockContext);
    expect(handlers).toBeDefined();
    expect(handlers.context).toBe(mockContext);
  });
}); 