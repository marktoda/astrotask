import { describe, it, expect } from 'vitest';

// Import the next command to test its exports
import * as nextCommand from '../../../source/commands/task/next.js';

describe('Next Task Command', () => {
  it('should export description', () => {
    expect(nextCommand.description).toBeDefined();
    expect(typeof nextCommand.description).toBe('string');
    expect(nextCommand.description.length).toBeGreaterThan(0);
    expect(nextCommand.description).toBe('Show the next available task to work on, based on status and completed dependencies');
  });

  it('should export default component', () => {
    expect(nextCommand.default).toBeDefined();
    expect(typeof nextCommand.default).toBe('function');
  });

  it('should have proper component name', () => {
    expect(nextCommand.default.name).toBe('Next');
  });

  it('should export options schema', () => {
    expect(nextCommand.options).toBeDefined();
    expect(typeof nextCommand.options.parse).toBe('function');
  });

  it('should accept root option in schema', () => {
    // Test that the schema accepts a root option
    const validOptions = nextCommand.options.parse({
      root: 'test-root-id'
    });
    expect(validOptions.root).toBe('test-root-id');

    // Test that it also works without root option
    const validOptionsWithoutRoot = nextCommand.options.parse({});
    expect(validOptionsWithoutRoot.root).toBeUndefined();
  });
}); 