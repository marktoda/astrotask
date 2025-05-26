# Astrolabe Testing

This directory contains all tests for the Astrolabe project.

## Testing Framework

We use [Vitest](https://vitest.dev/) as our testing framework, which provides:
- Fast execution with native ES modules support
- TypeScript support out of the box
- Jest-compatible API
- Built-in coverage reporting

## Test Structure

```
test/
├── README.md          # This file
├── basic.test.ts      # Basic framework tests
└── ...                # Additional test files
```

## Running Tests

```bash
# Run tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run full verification (includes tests)
pnpm verify
```

## Testing Standards

### File Naming
- Test files should end with `.test.ts` or `.spec.ts`
- Use descriptive names that indicate what's being tested
- Example: `user-authentication.test.ts`, `task-parsing.spec.ts`

### Test Structure
- Use `describe` blocks to group related tests
- Use clear, descriptive test names with `it` or `test`
- Follow the Arrange-Act-Assert pattern

### Example Test
```typescript
import { describe, it, expect } from 'vitest';
import { someFunction } from '@/utils/some-module';

describe('SomeModule', () => {
  it('should handle valid input correctly', () => {
    // Arrange
    const input = 'test-input';
    
    // Act
    const result = someFunction(input);
    
    // Assert
    expect(result).toBe('expected-output');
  });
});
```

### Importing from Source
Use the `@/` alias to import from the source directory:
```typescript
import { MyClass } from '@/path/to/module';
```

## Coverage

Vitest includes built-in coverage reporting. Coverage reports will be generated in the `coverage/` directory when running tests with coverage enabled.

## Best Practices

1. **Test file organization**: Mirror the source structure when logical
2. **Test isolation**: Each test should be independent 
3. **Clear assertions**: Use specific matchers like `.toBe()`, `.toEqual()`, `.toContain()`
4. **Async testing**: Use `async/await` for async operations
5. **Error testing**: Test both success and failure cases 