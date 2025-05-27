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
  tasks: CreateTask[]; // Direct CreateTask objects ready for database
  metadata?: Record<string, unknown>; // Flexible metadata populated by generator
  warnings?: string[];
}

interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
}

// LLM chain result structure - outputs CreateTask directly
interface LLMChainResult {
  tasks: Omit<CreateTask, 'parentId'>[]; // LLM outputs tasks without parentId
  confidence: number;
  warnings?: string[];
}

// Input parameters for LangChain invoke
interface LLMChainInput {
  content: string;
  existingTasks: Task[];
  metadata: Record<string, unknown>;
}
```

### Service Layer

Since we're starting with just PRD generation, we'll integrate the `PRDTaskGenerator` directly with the MCP handlers. A service layer can be added later if we need multiple generator types.

```typescript
class PRDTaskGenerator {
  readonly type = "prd";
  
  private chain: RunnableSequence;
  
  constructor(
    private llm: ChatOpenAI, 
    private logger: Logger,
    private store: Store
  ) {
    this.initializeChain();
  }

  async generate(
    input: GenerationInput,
    parentId?: string | null
  ): Promise<CreateTask[]> {
    const startTime = Date.now();

    // Parse PRD and generate tasks
    const chainInput: LLMChainInput = {
      content: input.content,
      existingTasks: input.context?.existingTasks || [],
      metadata: input.metadata || {},
    };

    const result: LLMChainResult = await this.chain.invoke(chainInput);

    // Just add parentId to complete CreateTask objects
    const createTasks: CreateTask[] = result.tasks.map(task => ({
      ...task,
      parentId, // All tasks get the same parent (or null for root)
    }));

    // Store metadata for potential use (could be returned or logged)
    const metadata = {
      generator: this.type,
      inputSize: input.content.length,
      processingTime: Date.now() - startTime,
      model: this.llm.modelName,
      confidence: result.confidence,
      tasksGenerated: createTasks.length,
      ...input.metadata,
    };

    this.logger.info('Tasks generated successfully', metadata);

    return createTasks;
  }

  async validate(input: GenerationInput): Promise<ValidationResult> {
    // Validate PRD format and content
    if (input.content.length === 0) {
      return { valid: false, errors: ["Empty content provided"] };
    }

    if (input.content.length > 50000) {
      return {
        valid: false,
        errors: ["Content too large (max 50KB)"],
        suggestions: ["Split into smaller documents"],
      };
    }

    return { valid: true };
  }

  private initializeChain(): void {
    // Set up LangGraph workflow for PRD analysis
    // This will include prompts that instruct the LLM to:
    // 1. Identify main features/requirements
    // 2. Break down into implementable tasks
    // 3. Set appropriate priorities
    // 4. Output tasks in CreateTask format (without parentId)
  }
}
```

### Simple Task Creation

The system generates a flat list of sibling tasks under a single parent:

```typescript
// LLM outputs CreateTask objects directly (without parentId)
const llmTasks: Omit<CreateTask, 'parentId'>[] = [
  {
    title: "Design user authentication API",
    description: "Create REST endpoints for login/logout/register",
    priority: "high",
    status: "pending",
    prd: "Users need secure authentication system",
  },
  {
    title: "Implement JWT token management",
    description: "Add JWT generation, validation, and refresh",
    priority: "high", 
    status: "pending",
    prd: "Tokens should expire after 24 hours",
  },
  {
    title: "Create user registration form",
    description: "Build frontend form with validation",
    priority: "medium",
    status: "pending",
    prd: "Form should validate email format and password strength",
  },
];

// Just add parentId to complete CreateTask objects
const createTasks: CreateTask[] = llmTasks.map(task => ({
  ...task,
  parentId: "parent-task-uuid", // All tasks get the same parent
}));
```

## Implementation Strategy

### Simple Start: Direct PRD Generator

We'll implement the PRD generator directly without a complex service layer. If we later need multiple generator types, we can refactor to add a service layer. We should use structured output features of langchain.

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
  context: z
    .object({
      parentTaskId: z.string().optional(),
      existingTasks: z.array(z.string()).optional(), // Task IDs for context
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(), // Generator-specific options
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

  constructor(public readonly context: HandlerContext) {
    // Initialize PRD generator with LLM configuration
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
      temperature: 0.1,
    });

    this.prdGenerator = new PRDTaskGenerator(llm, this.context.logger, this.context.store);
  }

  async generateTasks(params: GenerateTasksInput): Promise<object> {
    // Only support PRD generation for now
    if (params.type !== "prd") {
      throw new Error(
        `Unsupported generator type: ${params.type}. Only 'prd' is currently supported.`
      );
    }

    // Load existing tasks for context if requested
    let existingTasks: Task[] = [];
    if (params.context?.existingTasks) {
      existingTasks = await Promise.all(
        params.context.existingTasks.map((id) => this.context.store.getTask(id))
      ).then((tasks) => tasks.filter(Boolean) as Task[]);
    }

    // Generate tasks
    const createTasks = await this.prdGenerator.generate(
      {
        content: params.content,
        context: {
          ...params.context,
          existingTasks,
        },
        metadata: params.metadata,
      },
      params.context?.parentTaskId
    );

    return {
      tasks: createTasks.map(taskToApi),
      metadata: {
        generator: "prd",
        tasksGenerated: createTasks.length,
      },
    };
  }

  async listGenerators(params: ListGeneratorsInput): Promise<object> {
    return {
      generators: [
        {
          type: "prd",
          name: "Product Requirements Document Generator",
          description: "Generate tasks from PRD documents using LangChain",
          ...(params.includeMetadata && {
            metadata: {
              model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
              maxInputLength: 50000,
              supportedFormats: ["markdown", "plain text"],
            },
          }),
        },
      ],
    };
  }

  async validateGenerationInput(
    params: ValidateGenerationInputInput
  ): Promise<object> {
    if (params.type !== "prd") {
      throw new Error(
        `Unsupported generator type: ${params.type}. Only 'prd' is currently supported.`
      );
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
│   ├── TaskService.ts                    # Existing
│   └── generators/
│       ├── PRDTaskGenerator.ts           # Main PRD generator implementation
│       └── schemas.ts                    # Zod schemas for generation
└── utils/
    ├── llm.ts                            # LLM configuration utilities
    └── prompts.ts                        # Shared LLM prompts

packages/mcp/src/handlers/
└── TaskGenerationHandlers.ts             # MCP integration with generators
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
describe("PRDTaskGenerator", () => {
  it("should generate tasks with proper hierarchy");
  it("should assign meaningful tempIds");
  it("should validate PRD format");
  it("should handle malformed input gracefully");
  it("should respect metadata options");
});

// Service testing  
describe("TaskGenerationService", () => {
  it("should resolve tempIds to UUIDs correctly");
  it("should maintain parent-child relationships");
  it("should handle circular references gracefully");
  it("should create tasks in correct order");
});
```

### Integration Tests

```typescript
// MCP handler testing
describe("TaskGenerationHandlers", () => {
  it("should generate hierarchical tasks via MCP");
  it("should link generated tasks to specified parent");
  it("should return proper error responses");
  it("should validate input parameters");
});
```

## Error Handling

```typescript
enum GenerationErrorType {
  INVALID_INPUT = "invalid_input",
  GENERATOR_NOT_FOUND = "generator_not_found",
  LLM_ERROR = "llm_error",
  TIMEOUT = "timeout",
  RATE_LIMIT = "rate_limit",
  HIERARCHY_ERROR = "hierarchy_error",
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