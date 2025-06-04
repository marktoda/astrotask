/**
 * Example demonstrating the new enum-based dependency injection system
 */

import { 
  createAstrotask, 
  DependencyType, 
  Registry,
  type AstrotaskConfig 
} from '../src/index.js';

// Example 1: Basic usage with default services
async function basicUsage() {
  console.log('\n=== Basic Usage ===');
  
  const astrotask = await createAstrotask({
    databaseUrl: 'memory://example',
  });

  const task = await astrotask.store.addTask({
    title: 'Example Task',
    status: 'pending',
    priority: 'high',
  });

  console.log(`Created task: ${task.id} - ${task.title}`);
  
  await astrotask.dispose();
}

// Example 2: Override LLM service for testing/different providers
async function customLLMService() {
  console.log('\n=== Custom LLM Service ===');
  
  const astrotask = await createAstrotask({
    databaseUrl: 'memory://example',
    overrides(registry) {
      // Replace LLM service with a proper mock for testing
      registry.register(DependencyType.LLM_SERVICE, {
        getChatModel: () => {
          console.log('Using custom LLM service!');
          const mockLLM = {
            // LangChain Runnable interface methods
            invoke: async (input: any) => {
              console.log('Mock LLM called with:', JSON.stringify(input).substring(0, 50) + '...');
              return { content: 'Mock response for testing', role: 'assistant' };
            },
            
            pipe: (nextRunnable: any) => {
              // Return mock runnable that implements the chain
              return {
                invoke: async (input: any) => {
                  // Return mock complexity analysis results
                  return [{
                    taskId: 'test-task',
                    taskTitle: 'Mock Task',
                    complexityScore: 5,
                    recommendedSubtasks: 3,
                    expansionPrompt: 'Mock expansion',
                    reasoning: 'Mock reasoning'
                  }];
                },
                
                pipe: (nextNextRunnable: any) => {
                  return {
                    invoke: async (input: any) => {
                      return [{
                        taskId: 'test-task',
                        taskTitle: 'Mock Task',
                        complexityScore: 5,
                        recommendedSubtasks: 3,
                        expansionPrompt: 'Mock expansion',
                        reasoning: 'Mock reasoning'
                      }];
                    }
                  };
                }
              };
            },
            
            // Add LangChain-specific properties
            lc_runnable: true,
            lc_namespace: ['langchain', 'chat_models', 'openai'],
            modelName: 'test-model',
            temperature: 0,
            maxTokens: 100,
          };
          
          return mockLLM as any;
        },
      });
    },
  });

  const task = await astrotask.store.addTask({
    title: 'Test Complexity Analysis',
    description: 'This task will use our custom LLM service',
    status: 'pending',
    priority: 'medium',
  });

  try {
    const analysis = await astrotask.complexity.analyzeTask(task);
    console.log('Complexity analysis result:', analysis);
  } catch (error) {
    console.log('Error with mock service:', error instanceof Error ? error.message : error);
  }
  
  await astrotask.dispose();
}

// Example 3: Feature flagging - use different services based on environment
async function featureFlagging() {
  console.log('\n=== Feature Flagging ===');
  
  const useAdvancedFeatures = process.env.ENABLE_ADVANCED_FEATURES === 'true';
  
  const config: AstrotaskConfig = {
    databaseUrl: 'memory://example',
    overrides(registry) {
      if (!useAdvancedFeatures) {
        // Disable advanced features by providing minimal implementations
        registry.register(DependencyType.LLM_SERVICE, {
          getChatModel: () => {
            // Return a mock that works but indicates features are disabled
            return {
              invoke: async (_input: any) => ({ content: 'Advanced features disabled', role: 'assistant' }),
              pipe: (_nextRunnable: any) => ({
                invoke: async (_input: any) => [],
                pipe: (_nextNextRunnable: any) => ({
                  invoke: async (_input: any) => []
                })
              }),
              lc_runnable: true,
              lc_namespace: ['langchain', 'chat_models', 'mock'],
              modelName: 'disabled-model',
              temperature: 0,
              maxTokens: 0,
            } as any;
          },
        });
      }
      // Otherwise use default services
    },
  };

  const astrotask = await createAstrotask(config);
  
  const task = await astrotask.store.addTask({
    title: 'Feature Flag Test',
    status: 'pending',
    priority: 'low',
  });

  console.log(`Advanced features enabled: ${useAdvancedFeatures}`);
  console.log(`Created task: ${task.id} - ${task.title}`);
  
  if (!useAdvancedFeatures) {
    console.log('Complexity analysis disabled in this mode');
  }
  
  await astrotask.dispose();
}

// Example 4: Registry merging for modular overrides
async function registryMerging() {
  console.log('\n=== Registry Merging ===');
  
  // Create a separate registry with testing overrides
  const testingRegistry = new Registry();
  testingRegistry.register(DependencyType.LLM_SERVICE, {
    getChatModel: () => {
      console.log('Using testing LLM service');
      return {} as any; // Minimal mock
    },
  });

  const astrotask = await createAstrotask({
    databaseUrl: 'memory://example',
    overrides(registry) {
      // Merge in testing overrides
      registry.merge(testingRegistry);
      
      // Add additional overrides specific to this instance
      console.log('Applied testing registry and additional overrides');
    },
  });

  const task = await astrotask.store.addTask({
    title: 'Registry Merge Test',
    status: 'pending',
    priority: 'medium',
  });

  console.log(`Created task: ${task.id} - ${task.title}`);
  
  await astrotask.dispose();
}

// Example 5: Production configuration with Azure OpenAI
async function productionExample() {
  console.log('\n=== Production Example ===');
  
  const astrotask = await createAstrotask({
    databaseUrl: process.env.DATABASE_URL || 'memory://production',
    overrides(registry) {
      // Example: Switch to Azure OpenAI in production
      if (process.env.NODE_ENV === 'production') {
        registry.register(DependencyType.LLM_SERVICE, () => {
          console.log('Using Azure OpenAI service');
          // In real code, you would import and use AzureOpenAI here
          return {
            getChatModel: () => {
              // Return actual Azure OpenAI instance
              console.log('Azure OpenAI configured');
              return {} as any;
            },
          };
        });
      }
    },
  });

  const task = await astrotask.store.addTask({
    title: 'Production Task',
    status: 'pending',
    priority: 'high',
  });

  console.log(`Created task in ${process.env.NODE_ENV || 'development'} mode: ${task.id}`);
  
  await astrotask.dispose();
}

// Run all examples
async function runExamples() {
  console.log('🚀 Dependency Injection Examples');
  
  try {
    await basicUsage();
    await customLLMService();
    await featureFlagging();
    await registryMerging();
    await productionExample();
    
    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
} 