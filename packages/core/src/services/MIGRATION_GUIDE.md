# Service Initialization Migration Guide

This guide helps you migrate from the legacy service initialization patterns to the new unified approach.

## Overview

We've consolidated two competing service initialization patterns (`ServiceFactory` and `default-registry`) into a single, unified approach that combines the best of both:

- **Clear interfaces** from ServiceFactory
- **Dependency injection** from the Registry pattern
- **Better testability** and flexibility

## Migration Steps

### From ServiceFactory (createServices)

**Before:**
```typescript
import { createServices } from '@astrotask/core';

const services = createServices({
  adapter: myAdapter,
  llmService: myLLMService,
  complexityConfig: { threshold: 7 },
  expansionConfig: { maxSubtasks: 10 }
});

// Access services
const { store, taskService, dependencyService } = services;
```

**After:**
```typescript
import { initializeServices } from '@astrotask/core';

const { services } = await initializeServices({
  adapter: myAdapter,
  llmService: myLLMService,
  complexityConfig: { threshold: 7 },
  expansionConfig: { maxSubtasks: 10 }
});

// Access services (same interface)
const { store, taskService, dependencyService } = services;
```

### From Registry Pattern (createDefaultRegistry)

**Before:**
```typescript
import { createDefaultRegistry, DependencyType } from '@astrotask/core';

const { registry, store } = createDefaultRegistry({
  adapter: myAdapter,
  complexityConfig: { threshold: 7 }
});

// Apply overrides
registry.register(DependencyType.LLM_SERVICE, customLLMService);

// Resolve services manually
const taskService = await registry.resolve(DependencyType.TASK_SERVICE);
```

**After:**
```typescript
import { initializeServices } from '@astrotask/core';

const { registry, store, services } = await initializeServices({
  adapter: myAdapter,
  llmService: customLLMService, // Direct configuration
  complexityConfig: { threshold: 7 }
});

// Services are pre-resolved
const { taskService } = services;

// Registry is still available for advanced use cases
```

### For Testing with Overrides

**Before:**
```typescript
const services = createServices({ adapter, llmService: mockLLM });
// OR
const { registry } = createDefaultRegistry({ adapter });
registry.register(DependencyType.LLM_SERVICE, mockLLM);
```

**After:**
```typescript
import { createServiceContainer } from '@astrotask/core';

// Option 1: Direct configuration
const services = await createServiceContainer({
  adapter,
  llmService: mockLLM
});

// Option 2: With registry overrides
const services = await createServiceContainer(
  { adapter },
  (registry) => {
    registry.register(DependencyType.LLM_SERVICE, mockLLM);
    registry.register(DependencyType.TASK_SERVICE, mockTaskService);
  }
);
```

## Key Differences

1. **Async initialization**: The new `initializeServices` is async to properly handle service resolution
2. **Pre-resolved services**: Services are automatically resolved and returned in a container
3. **Optional services**: LLM-dependent services (complexityAnalyzer, taskExpansionService) are properly typed as optional
4. **Better error handling**: Failed service resolution is handled gracefully

## Benefits

- **Single source of truth**: One way to initialize services
- **Type safety**: Better TypeScript support with proper optional handling
- **Flexibility**: Still supports registry overrides when needed
- **Cleaner API**: More intuitive configuration interface

## Deprecation Timeline

- **Current**: Both old patterns are marked as deprecated but still functional
- **Next minor version**: Deprecation warnings will be logged
- **Next major version**: Old patterns will be removed

## Need Help?

If you encounter any issues during migration, please open an issue on GitHub. 