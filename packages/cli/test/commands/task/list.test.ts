import { describe, it, expect } from 'vitest';

// Import the list command to test its exports
import * as listCommand from '../../../source/commands/task/list.js';

describe('List Task Command', () => {
  it('should export description', () => {
    expect(listCommand.description).toBeDefined();
    expect(typeof listCommand.description).toBe('string');
    expect(listCommand.description.length).toBeGreaterThan(0);
    expect(listCommand.description).toBe('List tasks with status and priority information. By default, shows only pending and in-progress tasks. Use --show-all to include completed and archived tasks.');
  });

  it('should export default component', () => {
    expect(listCommand.default).toBeDefined();
    expect(typeof listCommand.default).toBe('function');
  });

  it('should have proper component name', () => {
    expect(listCommand.default.name).toBe('List');
  });
}); 