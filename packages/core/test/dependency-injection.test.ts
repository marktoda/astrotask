import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAstrotask, createTestAstrotask, type Astrotask } from '../src/index.js';
import { Registry, DependencyType } from '../src/index.js';

describe('Dependency Injection System', () => {
  let astrotask: Astrotask;

  afterEach(async () => {
    if (astrotask?.isInitialized) {
      await astrotask.dispose();
    }
  });

  it('should use default services when no overrides are provided', async () => {
    astrotask = await createTestAstrotask();
    
    expect(astrotask.isInitialized).toBe(true);
    expect(astrotask.tasks).toBeDefined();
    expect(astrotask.dependencies).toBeDefined();
    expect(astrotask.complexity).toBeDefined();
    expect(astrotask.expansion).toBeDefined();
    expect(astrotask.store).toBeDefined();
  });

  it('should allow overriding services via the registry', async () => {
    let customServiceWasCalled = false;

    astrotask = await createAstrotask({
      databaseUrl: 'memory://test',
      overrides(registry) {
        // Override the LLM service with a custom implementation
        registry.register(DependencyType.LLM_SERVICE, {
          getChatModel: () => {
            customServiceWasCalled = true;
            // Return a more realistic mock that supports the LangChain interface
            return {
              pipe: () => ({
                pipe: () => ({
                  invoke: async () => [],
                }),
              }),
            } as any;
          },
        });
      },
    });

    expect(astrotask.isInitialized).toBe(true);
    
    // Use the complexity analyzer which should use our custom LLM service
    const task = await astrotask.store.addTask({
      title: 'Test Task',
      status: 'pending',
      priorityScore: 50,
    });

    try {
      await astrotask.complexity.analyzeTask(task);
    } catch (error) {
      // The service might fail due to our mock, but we just want to verify it was called
    }

    expect(customServiceWasCalled).toBe(true);
  });

  it('should allow registry merging for advanced scenarios', async () => {
    const overrideRegistry = new Registry();
    overrideRegistry.register(DependencyType.LLM_SERVICE, {
      getChatModel: () => ({
        pipe: () => ({
          pipe: () => ({
            invoke: async () => [],
          }),
        }),
      }) as any,
    });

    astrotask = await createAstrotask({
      databaseUrl: 'memory://test',
      overrides(registry) {
        registry.merge(overrideRegistry);
      },
    });

    expect(astrotask.isInitialized).toBe(true);
  });

  it('should preserve existing functionality with new DI system', async () => {
    astrotask = await createTestAstrotask();

    // Create a task
    const task = await astrotask.store.addTask({
      title: 'Test Task',
      status: 'pending',
      priorityScore: 50,
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Test Task');

    // Get the task
    const retrieved = await astrotask.store.getTask(task.id);
    expect(retrieved).toEqual(task);

    // Use task service
    const taskTree = await astrotask.tasks.getTaskTree(task.id);
    expect(taskTree).toBeDefined();
    expect(taskTree?.task.id).toBe(task.id);

    // Use dependency service
    const deps = await astrotask.dependencies.getDependencies(task.id);
    expect(Array.isArray(deps)).toBe(true);
  });

  it('should support service resolution and memoization', async () => {
    let llmServiceCreationCount = 0;

    astrotask = await createAstrotask({
      databaseUrl: 'memory://test',
      overrides(registry) {
        // Override to track creation
        registry.register(DependencyType.LLM_SERVICE, () => {
          llmServiceCreationCount++;
          return {
            getChatModel: () => ({
              pipe: () => ({
                pipe: () => ({
                  invoke: async () => [],
                }),
              }),
            }),
          } as any;
        });
      },
    });

    expect(astrotask.isInitialized).toBe(true);
    // The LLM service should have been created during initialization
    expect(llmServiceCreationCount).toBe(1);
    
    // Try to access complexity service multiple times - LLM should only be created once due to memoization
    await astrotask.complexity;
    await astrotask.expansion;
    
    // Should still be 1 due to memoization
    expect(llmServiceCreationCount).toBe(1);
  });
}); 