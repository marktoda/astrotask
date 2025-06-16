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

  it.skip('should allow overriding services via the registry', async () => {
    let customServiceWasCalled = false;

    astrotask = await createAstrotask({
      databaseUrl: 'memory://test',
      overrides(registry) {
        // Override the LLM service with a custom implementation
        registry.register(DependencyType.LLM_SERVICE, () => {
          return {
            getChatModel: () => {
              // Return a mock that properly implements the chain
              return {
                pipe: (next: any) => ({
                  pipe: (parser: any) => ({
                    invoke: async (input: any) => {
                      customServiceWasCalled = true;
                      // Return mock complexity analysis results
                      return [{
                        taskId: 'test-task',
                        taskTitle: 'Test Task',
                        complexityScore: 5,
                        recommendedSubtasks: 3,
                        expansionPrompt: 'Test expansion prompt',
                        reasoning: 'Test reasoning for complexity analysis',
                      }];
                    },
                  }),
                }),
              } as any;
            },
            getConfig: () => ({
              apiKey: 'test',
              modelName: 'test',
              temperature: 0.7,
              maxTokens: 1000,
              timeout: 30000,
            }),
            validateConfig: () => [],
            isConfigured: () => true,
            getModelConfig: () => ({
              id: 'test',
              name: 'Test Model',
              contextWindow: 4096,
              maxTokens: 1000,
              temperature: 0.7,
              timeout: 30000,
            }),
          };
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

    // Actually call analyzeTask to trigger the LLM service
    const result = await astrotask.complexity.analyzeTask(task);
    
    expect(customServiceWasCalled).toBe(true);
    expect(result).toBeDefined();
    expect(result.taskId).toBe('test-task');
  });

  it('should allow registry merging for advanced scenarios', async () => {
    const overrideRegistry = new Registry();
    overrideRegistry.register(DependencyType.LLM_SERVICE, () => ({
      getChatModel: () => ({
        pipe: () => ({
          pipe: () => ({
            invoke: async () => [],
          }),
        }),
      }) as any,
    }));

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

  it.skip('should support service resolution and memoization', async () => {
    let llmServiceCreationCount = 0;
    let llmServiceInstance: any = null;

    astrotask = await createAstrotask({
      databaseUrl: 'memory://test',
      overrides(registry) {
        // Override to track creation
        registry.register(DependencyType.LLM_SERVICE, () => {
          llmServiceCreationCount++;
          if (!llmServiceInstance) {
            llmServiceInstance = {
              getChatModel: () => ({
                pipe: () => ({
                  pipe: () => ({
                    invoke: async () => [{
                      taskId: 'test-task',
                      taskTitle: 'Test Task',
                      complexityScore: 5,
                      recommendedSubtasks: 3,
                      expansionPrompt: 'Test expansion prompt',
                      reasoning: 'Test reasoning',
                    }],
                  }),
                }),
              }),
              getConfig: () => ({
                apiKey: 'test',
                modelName: 'test',
                temperature: 0.7,
                maxTokens: 1000,
                timeout: 30000,
              }),
              validateConfig: () => [],
              isConfigured: () => true,
              getModelConfig: () => ({
                id: 'test',
                name: 'Test Model',
                contextWindow: 4096,
                maxTokens: 1000,
                temperature: 0.7,
                timeout: 30000,
              }),
            } as any;
          }
          return llmServiceInstance;
        });
      },
    });

    expect(astrotask.isInitialized).toBe(true);
    
    // Access services that depend on LLM service
    // This should trigger LLM service creation
    const complexity = astrotask.complexity;
    expect(complexity).toBeDefined();
    expect(llmServiceCreationCount).toBe(1);
    
    // Access expansion service - should reuse the same LLM service instance
    const expansion = astrotask.expansion;
    expect(expansion).toBeDefined();
    
    // Should still be 1 due to memoization
    expect(llmServiceCreationCount).toBe(1);
  });
}); 