# Task Auto-Generation System Design

## Overview

This document outlines the design for an extensible task auto-generation system that allows multiple methods of generating tasks from various input sources. The system follows the existing Astrolabe architectural patterns and integrates seamlessly with the current MCP server and core services.

## Goals

- **Extensible**: Support multiple generation strategies (PRD, TDD, GitHub issues, etc.)
- **Clean**: Follow existing architectural patterns and maintain type safety
- **Simple**: Start with PRD-based generation using LangChain/LangGraph
- **Consistent**: Integrate with existing TaskService and Store interfaces
- **Validated**: Use Zod schemas for input/output validation

## Architecture

### Core Interfaces

```typescript
interface TaskGenerator {
  readonly type: string;
  generate(input: GenerationInput): Promise<GenerationResult>;
  validate(input: GenerationInput): Promise<ValidationResult>;
}

interface GenerationInput {
  content: string;
  context?: GenerationContext;
  metadata?: Record<string, unknown>;
}

interface GenerationContext {
  existingTasks?: Task[];
  parentTaskId?: string | null;
  metadata?: Record<string, unknown>;
}

interface GenerationResult {
  tasks: GeneratedTask[];
  metadata?: Record<string, unknown>;  // Flexible metadata populated by generator
  warnings?: string[];
}

interface GeneratedTask extends Omit<CreateTask, 'parentId'> {
  tempId: string;                    // Temporary ID for hierarchy resolution
  parentTempId?: string | null;      // Reference to parent's tempId
}

interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
}
```

### Service Layer

Since we're starting with just PRD generation, we'll integrate the `PRDTaskGenerator` directly with the MCP handlers. A service layer can be added later if we need multiple generator types.

```typescript
class PRDTaskGenerator {
  readonly type = 'prd';
  
  private chain: RunnableSequence;
  
  constructor(
    private llm: ChatOpenAI,
    private logger: Logger
  ) {
    this.initializeChain();
  }

  async generate(input: GenerationInput): Promise<GenerationResult>;
  async validate(input: GenerationInput): Promise<ValidationResult>;
  
  async createTasks(
    result: GenerationResult,
    store: Store,
    rootParentId?: string | null
  ): Promise<Task[]>;
  
  private resolveTempIds(
    generatedTasks: GeneratedTask[],
    rootParentId?: string | null
  ): CreateTask[];
}
```

### Hierarchy Resolution

The system handles task hierarchy through temporary IDs that get resolved during creation:

```typescript
// During generation, tasks use temporary IDs
const generatedTasks: GeneratedTask[] = [
  {
    tempId: "epic-1",
    title: "User Authentication System",
    description: "Implement complete auth system",
    parentTempId: null,  // Root task
    priority: "high",
    status: "pending"
  },
  {
    tempId: "task-1-1", 
    title: "Design login API",
    description: "Create REST endpoints for authentication",
    parentTempId: "epic-1",  // Child of epic-1
    priority: "high",
    status: "pending"
  },
  {
    tempId: "task-1-2",
    title: "Implement JWT tokens", 
    description: "Add JWT token generation and validation",
    parentTempId: "epic-1",  // Child of epic-1
    priority: "medium",
    status: "pending"
  }
];

// Service resolves hierarchy when creating actual tasks
const createdTasks = await this.createGeneratedTasks(result, "parent-task-uuid");
```

## Implementation Strategy

### Simple Start: Direct PRD Generator

We'll implement the PRD generator directly without a complex service layer. If we later need multiple generator types, we can refactor to add a service layer.

```typescript
class PRDTaskGenerator {
  readonly type = 'prd';
  
  private chain: RunnableSequence;
  
  constructor(
    private llm: ChatOpenAI,
    private logger: Logger
  ) {
    this.initializeChain();
  }

  async generate(input: GenerationInput): Promise<GenerationResult> {
    const startTime = Date.now();
    
    // Parse PRD and generate hierarchical tasks
    const result = await this.chain.invoke({
      content: input.content,
      existingTasks: input.context?.existingTasks || [],
      metadata: input.metadata || {}
    });
    
    return {
      tasks: this.buildTaskHierarchy(result.tasks),
      metadata: {
        generator: this.type,
        inputSize: input.content.length,
        processingTime: Date.now() - startTime,
        model: this.llm.modelName,
        confidence: result.confidence,
        ...input.metadata
      },
      warnings: result.warnings
    };
  }

  async validate(input: GenerationInput): Promise<ValidationResult> {
    // Validate PRD format and content
    if (input.content.length === 0) {
      return { valid: false, errors: ['Empty content provided'] };
    }
    
    if (input.content.length > 50000) {
      return { 
        valid: false, 
        errors: ['Content too large (max 50KB)'],
        suggestions: ['Split into smaller documents']
      };
    }
    
    return { valid: true };
  }

  private buildTaskHierarchy(rawTasks: any[]): GeneratedTask[] {
    // Convert LLM output to structured hierarchy with tempIds
    return rawTasks.map((task, index) => ({
      tempId: task.tempId || `task-${index}`,
      parentTempId: task.parentTempId || null,
      title: task.title,
      description: task.description,
      priority: task.priority || 'medium',
      status: 'pending' as const,
      prd: task.requirements,
      contextDigest: task.context
    }));
  }

  private initializeChain(): void {
    // Set up LangGraph workflow for PRD analysis
    // This will include prompts that instruct the LLM to:
    // 1. Identify main epics/features
    // 2. Break down into implementable tasks  
    // 3. Create proper hierarchy with tempIds
    // 4. Set appropriate priorities
  }
}
```

### Future Expansion

When we need additional generator types, we can:
1. Extract the common `TaskGenerator` interface  
2. Create a `TaskGenerationService` with registration
3. Move the MCP handlers to use the service layer
4. Add new generator implementations

## MCP Integration

### New MCP Tools

Add these tools to the existing MCP handler system:

```typescript
// Generate tasks from input
export const generateTasksSchema = z.object({
  type: z.string(),
  content: z.string(),
  context: z.object({
    parentTaskId: z.string().optional(),
    existingTasks: z.array(z.string()).optional(),  // Task IDs for context
  }).optional(),
  metadata: z.record(z.unknown()).optional(),  // Generator-specific options
});

// List available generators
export const listGeneratorsSchema = z.object({
  includeMetadata: z.boolean().default(false),
});

// Validate input before generation
export const validateGenerationInputSchema = z.object({
  type: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
});
```

### MCP Handler Implementation

```typescript
export class TaskGenerationHandlers implements MCPHandler {
  private prdGenerator: PRDTaskGenerator;

  constructor(
    public readonly context: HandlerContext
  ) {
    // Initialize PRD generator with LLM configuration
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      temperature: 0.1,
    });
    
    this.prdGenerator = new PRDTaskGenerator(llm, context.logger);
  }

  async generateTasks(params: GenerateTasksInput): Promise<object> {
    // Only support PRD generation for now
    if (params.type !== 'prd') {
      throw new Error(`Unsupported generator type: ${params.type}. Only 'prd' is currently supported.`);
    }

    // Load existing tasks for context if requested
    let existingTasks: Task[] = [];
    if (params.context?.existingTasks) {
      existingTasks = await Promise.all(
        params.context.existingTasks.map(id => this.context.store.getTask(id))
      ).then(tasks => tasks.filter(Boolean) as Task[]);
    }

    // Generate tasks
    const result = await this.prdGenerator.generate({
      content: params.content,
      context: {
        ...params.context,
        existingTasks
      },
      metadata: params.metadata,
    });

    // Create tasks in the database with proper hierarchy
    const createdTasks = await this.prdGenerator.createTasks(
      result,
      this.context.store,
      params.context?.parentTaskId
    );

    return {
      tasks: createdTasks.map(taskToApi),
      metadata: result.metadata,
      warnings: result.warnings,
    };
  }

  async listGenerators(params: ListGeneratorsInput): Promise<object> {
    return {
      generators: [
        {
          type: 'prd',
          name: 'Product Requirements Document Generator',
          description: 'Generate tasks from PRD documents using LangChain',
          ...(params.includeMetadata && {
            metadata: {
              model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
              maxInputLength: 50000,
              supportedFormats: ['markdown', 'plain text']
            }
          })
        }
      ]
    };
  }

  async validateGenerationInput(params: ValidateGenerationInputInput): Promise<object> {
    if (params.type !== 'prd') {
      throw new Error(`Unsupported generator type: ${params.type}. Only 'prd' is currently supported.`);
    }

    return this.prdGenerator.validate({
      content: params.content,
      metadata: params.metadata,
    });
  }
}
```

## File Structure

```
packages/core/src/
├── services/
│   └── TaskService.ts                    # Existing (no new service needed)
├── generators/
│   ├── index.ts                          # Export PRDTaskGenerator
│   ├── base/
│   │   └── types.ts                      # Shared types and interfaces
│   ├── prd/
│   │   ├── PRDTaskGenerator.ts           # Main implementation
│   │   ├── prompts.ts                    # LLM prompts
│   │   └── validator.ts                  # Input validation
│   └── schemas/
│       └── generation.ts                 # Zod schemas
└── utils/
    └── llm.ts                            # LLM configuration utilities

packages/mcp/src/handlers/
└── TaskGenerationHandlers.ts             # MCP integration with PRDTaskGenerator
```

## Hierarchy Resolution Algorithm

```typescript
class PRDTaskGenerator {
  private resolveTempIds(
    generatedTasks: GeneratedTask[],
    rootParentId?: string | null
  ): CreateTask[] {
    const idMapping = new Map<string, string>();
    
    // Generate UUIDs for all tasks
    for (const task of generatedTasks) {
      idMapping.set(task.tempId, crypto.randomUUID());
    }
    
    // Build final tasks with resolved parent relationships
    const resolvedTasks: CreateTask[] = [];
    
    for (const task of generatedTasks) {
      const actualId = idMapping.get(task.tempId)!;
      let actualParentId: string | null = null;
      
      if (task.parentTempId) {
        // Child of another generated task
        actualParentId = idMapping.get(task.parentTempId) || null;
      } else if (rootParentId) {
        // Root task gets the provided parent
        actualParentId = rootParentId;
      }
      
      resolvedTasks.push({
        id: actualId,
        parentId: actualParentId,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        prd: task.prd,
        contextDigest: task.contextDigest,
      });
    }
    
    return resolvedTasks;
  }

  async createTasks(
    result: GenerationResult,
    store: Store,
    rootParentId?: string | null
  ): Promise<Task[]> {
    // Resolve temp IDs to actual CreateTask objects
    const createTaskRequests = this.resolveTempIds(result.tasks, rootParentId);
    
    // Create tasks in database (parents before children)
    const createdTasks: Task[] = [];
    
    // Simple approach: create all tasks (store should handle ordering)
    for (const taskRequest of createTaskRequests) {
      const task = await store.createTask(taskRequest);
      if (task) {
        createdTasks.push(task);
      }
    }
    
    return createdTasks;
  }
}
```

## Configuration

### Environment Variables

```bash
# LLM Configuration
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview  
OPENAI_TEMPERATURE=0.1

# Generation Limits
MAX_GENERATION_TASKS=50
MAX_INPUT_LENGTH=50000
GENERATION_TIMEOUT=60000
```

### TaskMaster Integration

Add generation commands to TaskMaster CLI:

```bash
# Generate from PRD file
task-master generate prd --input=requirements.md --parent=epic-1

# Generate with custom options
task-master generate prd --input=spec.txt --metadata='{"maxTasks":10,"strategy":"focused"}'

# List available generators
task-master generators list

# Validate input before generation
task-master generate validate --type=prd --input=draft.md
```

## Dependencies

### New Dependencies

Add to `packages/core/package.json`:

```json
{
  "dependencies": {
    "@langchain/core": "^0.1.0",
    "@langchain/openai": "^0.0.14", 
    "@langchain/community": "^0.0.25",
    "langchain": "^0.1.0",
    "tiktoken": "^1.0.0"
  }
}
```

## Testing Strategy

### Unit Tests

```typescript
// Generator testing
describe('PRDTaskGenerator', () => {
  it('should generate tasks with proper hierarchy');
  it('should assign meaningful tempIds');
  it('should validate PRD format');
  it('should handle malformed input gracefully');
  it('should respect metadata options');
});

// Service testing  
describe('TaskGenerationService', () => {
  it('should resolve tempIds to UUIDs correctly');
  it('should maintain parent-child relationships');
  it('should handle circular references gracefully');
  it('should create tasks in correct order');
});
```

### Integration Tests

```typescript
// MCP handler testing
describe('TaskGenerationHandlers', () => {
  it('should generate hierarchical tasks via MCP');
  it('should link generated tasks to specified parent');
  it('should return proper error responses');
  it('should validate input parameters');
});
```

## Error Handling

```typescript
enum GenerationErrorType {
  INVALID_INPUT = 'invalid_input',
  GENERATOR_NOT_FOUND = 'generator_not_found', 
  LLM_ERROR = 'llm_error',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  HIERARCHY_ERROR = 'hierarchy_error',
}

class GenerationError extends Error {
  constructor(
    public type: GenerationErrorType,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}
```

## Success Metrics

- **Accuracy**: Generated tasks should accurately reflect input requirements
- **Hierarchy**: Parent-child relationships should be logical and helpful
- **Completeness**: All major requirements should be captured as tasks
- **Usability**: Generated tasks should be actionable and well-structured
- **Performance**: Generation should complete within reasonable time limits
- **Extensibility**: New generator types should be easy to add

## Future Enhancements

1. **Dependency Detection**: Automatic dependency analysis between generated tasks
2. **Template System**: Reusable templates for common project types
3. **Iterative Refinement**: AI-powered improvement of generated task hierarchies
4. **Cross-Generator Consistency**: Ensure consistent output across generator types
5. **Integration Hooks**: Webhooks for external systems to trigger generation
6. **Collaborative Generation**: Multiple stakeholders can contribute to task generation 