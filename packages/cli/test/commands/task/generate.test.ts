import { describe, it, expect } from 'vitest';
import { options } from '../../../source/commands/task/generate.js';

describe('Generate Task Command', () => {
  describe('options schema', () => {
    it('should validate valid options with content', () => {
      const validOptions = {
        content: 'This is a PRD with requirements for building a web application...',
        type: 'prd' as const,
        verbose: false,
        dry: false,
      };

      expect(() => options.parse(validOptions)).not.toThrow();
    });

    it('should validate valid options with file', () => {
      const validOptions = {
        content: '',
        file: '/path/to/prd.md',
        type: 'prd' as const,
        parent: 'ABCD',
        context: 'EFGH,IJKL',
        verbose: true,
        dry: true,
      };

      expect(() => options.parse(validOptions)).not.toThrow();
    });

    it('should require content field', () => {
      const invalidOptions = {
        file: '/path/to/prd.md',
        type: 'prd' as const,
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should default type to prd', () => {
      const options_with_defaults = {
        content: 'Some PRD content',
      };

      const result = options.parse(options_with_defaults);
      expect(result.type).toBe('prd');
    });

    it('should default dry and verbose to false', () => {
      const options_with_defaults = {
        content: 'Some PRD content',
      };

      const result = options.parse(options_with_defaults);
      expect(result.dry).toBe(false);
      expect(result.verbose).toBe(false);
    });

    it('should validate content is string', () => {
      const invalidOptions = {
        content: 123, // Not a string
        type: 'prd' as const,
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate file is string when provided', () => {
      const invalidOptions = {
        content: 'Valid content',
        file: 123, // Not a string
        type: 'prd' as const,
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate parent is string when provided', () => {
      const invalidOptions = {
        content: 'Valid content',
        parent: 123, // Not a string
        type: 'prd' as const,
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate context is string when provided', () => {
      const invalidOptions = {
        content: 'Valid content',
        context: 123, // Not a string
        type: 'prd' as const,
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should only accept prd as generator type', () => {
      const invalidOptions = {
        content: 'Valid content',
        type: 'invalid' as any,
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate boolean fields', () => {
      const invalidOptions = {
        content: 'Valid content',
        dry: 'yes', // Not a boolean
        verbose: 'true', // Not a boolean
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });
  });
}); 