# Dependency Injection System

The Astrotask Core SDK now features a powerful, enum-based dependency injection (DI) system that provides:

- **Single source of truth**: All injectable dependencies are defined in one enum
- **Lazy evaluation**: Services are only instantiated when needed
- **Easy testing**: Simple service overrides via a single hook
- **Framework-free**: Lightweight implementation with minimal overhead
- **Type-safe**: Full TypeScript support with proper type inference

## Overview

The DI system replaces the previous approach of individual config fields for each service with a unified `overrides` hook that gives you complete control over the service registry.

### Before vs After

**Before (multiple config fields):**
```typescript
await createAstrotask({
  llmService: customLLMService,
  complexityConfig: { ... },
  expansionConfig: { ... }
});
```

**After (single overrides hook):**
```typescript
await createAstrotask({
  overrides(registry) {
    registry.register(DependencyType.LLM_SERVICE, customLLMService);
  }
});
```

## Core Components

### 1. DependencyType Enum

The `DependencyType` enum is the single source of truth for all injectable dependencies:

```typescript
export enum DependencyType {
  // Core services
  LLM_SERVICE = 'LLM_SERVICE',
  COMPLEXITY_ANALYZER = 'COMPLEXITY_ANALYZER',
  TASK_EXPANSION_SERVICE = 'TASK_EXPANSION_SERVICE',
  DEPENDENCY_SERVICE = 'DEPENDENCY_SERVICE',
  TASK_SERVICE = 'TASK_SERVICE',
}
```

### 2. Registry Class

The `Registry` class manages service providers with lazy evaluation and memoization:

```typescript
export class Registry {
  /** Register either a factory function or an instance */
  register<T>(token: DependencyType, value: Provider<T> | T): this

  /** Resolve (and memoize) a service */
  async resolve<T>(token: DependencyType): Promise<T>

  /** Merge another registry (useful for overrides) */
  merge(other: Registry): this
}
```

### 3. Provider Type

A provider is either a factory function or a ready-made instance:

```typescript
export type Provider<T = unknown> = () => T | Promise<T>;
```

## Usage Examples

### Basic Usage (No Overrides)

```typescript
import { createAstrotask } from '@astrotask/core';

const astrotask = await createAstrotask({
  databaseUrl: 'postgresql://localhost/mydb'
});

// All services use their default implementations
await astrotask.tasks.addTask({ ... });
await astrotask.complexity.analyzeTask(task);
```

### Simple Service Override

```typescript
import { createAstrotask, DependencyType } from '@astrotask/core';

const astrotask = await createAstrotask({
  overrides(registry) {
    // Replace LLM service with a custom implementation
    registry.register(DependencyType.LLM_SERVICE, {
      getChatModel: () => new AzureOpenAI({ ... })
    });
  }
});
```

### Testing with Mocks

```typescript
import { createAstrotask, DependencyType } from '@astrotask/core';

export async function createTestAstrotask() {
  return createAstrotask({
    databaseUrl: 'memory://test',
    overrides(registry) {
      // Mock LLM service for testing
      registry.register(DependencyType.LLM_SERVICE, {
        getChatModel: () => mockLLMModel
      });
    }
  });
}
```

### Feature Flagging

```typescript
const astrotask = await createAstrotask({
  overrides(registry) {
    if (!process.env.ENABLE_AI_FEATURES) {
      // Disable AI features by providing minimal implementations
      registry.register(DependencyType.LLM_SERVICE, {
        getChatModel: () => {
          throw new Error('AI features disabled');
        }
      });
    }
  }
});
```

### Registry Merging

```typescript
import { Registry, DependencyType } from '@astrotask/core';

// Create reusable registry with testing overrides
const testingRegistry = new Registry();
testingRegistry.register(DependencyType.LLM_SERVICE, mockLLMService);

const astrotask = await createAstrotask({
  overrides(registry) {
    // Merge in testing overrides
    registry.merge(testingRegistry);
    
    // Add instance-specific overrides
    registry.register(DependencyType.TASK_SERVICE, customTaskService);
  }
});
```

## Advanced Usage

### Conditional Service Registration

```typescript
const astrotask = await createAstrotask({
  overrides(registry) {
    // Use different LLM providers based on environment
    if (process.env.NODE_ENV === 'production') {
      registry.register(DependencyType.LLM_SERVICE, () => 
        new ProductionLLMService()
      );
    } else if (process.env.NODE_ENV === 'test') {
      registry.register(DependencyType.LLM_SERVICE, () => 
        new MockLLMService()
      );
    }
    // Development uses defaults
  }
});
```

### Dependency Injection in Providers

```typescript
const astrotask = await createAstrotask({
  overrides(registry) {
    // Services can resolve their own dependencies
    registry.register(DependencyType.COMPLEXITY_ANALYZER, async () => {
      const llmService = await registry.resolve(DependencyType.LLM_SERVICE);
      return new CustomComplexityAnalyzer(llmService, customConfig);
    });
  }
});
```

### Service Decoration

```typescript
const astrotask = await createAstrotask({
  overrides(registry) {
    // Wrap existing service with additional functionality
    const originalLLM = registry.resolve(DependencyType.LLM_SERVICE);
    
    registry.register(DependencyType.LLM_SERVICE, async () => {
      const llm = await originalLLM;
      return new LoggingLLMWrapper(llm);
    });
  }
});
```

## Benefits

### 1. Unified Interface
- Single `overrides` hook replaces multiple config fields
- Consistent pattern for all service overrides
- Easier to understand and maintain

### 2. Lazy Evaluation
- Services only created when needed
- Faster startup times
- Lower memory usage for unused features

### 3. Easy Testing
```typescript
// Before: Multiple helper constructors
const astrotask = await createTestAstrotask();
const astrotaskWithCustomLLM = await createTestAstrotaskWithLLM(mockLLM);

// After: One helper + overrides
const astrotask = await createAstrotask({
  databaseUrl: 'memory://test',
  overrides(reg) {
    reg.register(DependencyType.LLM_SERVICE, mockLLM);
  }
});
```

### 4. Type Safety
- Full TypeScript support
- Type inference for resolved services
- Compile-time checking of dependency types

### 5. Composability
- Registry merging allows reusable override sets
- Override inheritance and composition
- Modular service configuration

## Migration Guide

### From Individual Config Fields

**Before:**
```typescript
const astrotask = await createAstrotask({
  llmService: customLLM,
  complexityConfig: { threshold: 8 },
  expansionConfig: { research: true }
});
```

**After:**
```typescript
const astrotask = await createAstrotask({
  complexityConfig: { threshold: 8 },
  expansionConfig: { research: true },
  overrides(registry) {
    registry.register(DependencyType.LLM_SERVICE, customLLM);
  }
});
```

### From createTestAstrotask

**Before:**
```typescript
const astrotask = await createTestAstrotask({
  customConfig: value
});
```

**After:**
```typescript
const astrotask = await createAstrotask({
  databaseUrl: 'memory://test',
  customConfig: value,
  overrides(registry) {
    registry.register(DependencyType.LLM_SERVICE, mockLLM);
  }
});
```

## Best Practices

1. **Use DependencyType enum**: Always use the enum values, not string literals
2. **Keep providers pure**: Avoid side effects in provider functions
3. **Leverage memoization**: Registry automatically memoizes resolved services
4. **Test with overrides**: Use the overrides hook for all testing scenarios
5. **Document custom services**: When creating custom implementations, document the interface
6. **Use TypeScript generics**: Always specify types when resolving services

## Implementation Details

### Lazy Evaluation
Services are only instantiated when first resolved. Subsequent resolutions return the memoized instance.

### Memoization
The registry automatically memoizes resolved services, ensuring singletons within a registry instance.

### Type Safety
The system is fully type-safe with no `any` casts or unsafe property access. The `createDefaultRegistry()` function returns both the registry and store explicitly, ensuring compile-time type checking for all service interactions.

### Error Handling
Missing providers throw descriptive errors indicating which service couldn't be resolved.

### Performance
The system adds minimal overhead (<100 LOC) and scales linearly with the number of services.

## Examples

See [dependency-injection-example.ts](../examples/dependency-injection-example.ts) for complete working examples of all patterns described above. 