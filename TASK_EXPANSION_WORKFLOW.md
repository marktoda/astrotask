# Task Expansion Workflow

## Overview

The Task Expansion Workflow is an enhanced system that integrates complexity analysis with task expansion to create well-structured subtasks based on intelligent assessment and research-backed expansion strategies.

## Architecture

### Core Components

1. **TaskExpansionService** - Main orchestrator that coordinates complexity analysis and task generation
2. **ComplexityAnalyzer** - Analyzes task complexity and provides expansion recommendations
3. **ComplexityContextService** - Creates context slices with complexity analysis data
4. **PRDTaskGenerator** - Generates actual subtasks based on expansion prompts

### Integration Flow

```
Task → ComplexityAnalyzer → TaskExpansionService → PRDTaskGenerator → Subtasks
  ↓                              ↓
ComplexityContextService    Context Slices
```

## Features

### 1. Complexity-Guided Expansion

The system automatically analyzes task complexity and determines optimal subtask counts:

- **Complexity Scoring**: Tasks are scored 1-10 based on technical complexity, dependencies, and implementation challenges
- **Intelligent Recommendations**: Number of subtasks is recommended based on complexity score
- **Expansion Guidance**: Specific prompts are generated to guide subtask creation

### 2. Multiple Expansion Strategies

#### Complexity-Guided (Default)
- Uses AI analysis to determine optimal subtask count
- Provides detailed reasoning and expansion guidance
- Creates context slices with complexity data

#### Manual Override
- User specifies exact number of subtasks
- Bypasses complexity analysis
- Useful for specific requirements

#### Default Fallback
- Uses configured default when complexity analysis fails
- Ensures system reliability

### 3. Batch Operations

#### Batch Expansion
- Expand multiple tasks simultaneously
- Maintains individual task context
- Provides summary statistics

#### High-Complexity Auto-Expansion
- Automatically identifies high-complexity tasks
- Expands them based on complexity recommendations
- Skips tasks with existing subtasks (unless forced)

### 4. Advanced Configuration

```typescript
interface TaskExpansionConfig {
  useComplexityAnalysis: boolean;     // Enable complexity-guided expansion
  research: boolean;                  // Enable research mode for better results
  complexityThreshold: number;        // Threshold for high-complexity identification
  defaultSubtasks: number;           // Default subtask count
  maxSubtasks: number;               // Maximum subtasks per task
  forceReplace: boolean;             // Replace existing subtasks
  createContextSlices: boolean;      // Create complexity context slices
  projectName?: string;              // Project name for metadata
}
```

## MCP Tools

### Enhanced expandTask
```typescript
{
  taskId: string;
  numSubtasks?: number;    // Optional override
  context?: string;        // Additional context
  research?: boolean;      // Enable research mode
  force?: boolean;         // Force replace existing subtasks
}
```

### New expandTasksBatch
```typescript
{
  taskIds: string[];       // Multiple tasks to expand
  numSubtasks?: number;    // Subtasks per task
  context?: string;        // Shared context
  research?: boolean;      // Research mode
  force?: boolean;         // Force replacement
}
```

### New expandHighComplexityTasks
```typescript
{
  complexityThreshold?: number;  // Complexity threshold (default: 5)
  research?: boolean;           // Research mode
  force?: boolean;              // Force replacement
}
```

## Usage Examples

### Basic Expansion
```typescript
const result = await expansionService.expandTask({
  taskId: 'TASK-123',
  context: 'Focus on security and scalability'
});

console.log(`Created ${result.subtasks.length} subtasks`);
console.log(`Used complexity analysis: ${result.usedComplexityAnalysis}`);
```

### Batch Expansion
```typescript
const results = await expansionService.expandTasksBatch(
  ['TASK-1', 'TASK-2', 'TASK-3'],
  { numSubtasks: 4, research: true }
);

console.log(`Expanded ${results.length} tasks`);
```

### Auto-Expansion of Complex Tasks
```typescript
const result = await expansionService.expandHighComplexityTasks(7);

console.log(`Found ${result.summary.highComplexityTasks} high-complexity tasks`);
console.log(`Expanded ${result.summary.tasksExpanded} tasks`);
console.log(`Created ${result.summary.totalSubtasksCreated} subtasks`);
```

## Complexity Analysis Integration

### Scoring Criteria
- **Technical Complexity**: Algorithm complexity, system architecture requirements
- **Dependencies**: Number of integration points and external dependencies
- **Risk Factors**: Potential complications and unknowns
- **Testing Requirements**: Validation and verification complexity
- **Performance Considerations**: Scalability and optimization needs

### Expansion Recommendations
- **1-3 subtasks**: Simple tasks (complexity 1-4)
- **4-6 subtasks**: Moderate tasks (complexity 5-6)
- **7-12 subtasks**: Complex tasks (complexity 7-8)
- **13+ subtasks**: Extremely complex tasks (complexity 9-10)

### Context Slice Creation
The system automatically creates context slices containing:
- Complexity score and reasoning
- Recommended subtask count
- Expansion guidance
- Analysis metadata

## Workflow Integration

### Development Process
1. **Analyze Complexity**: Run complexity analysis on all tasks
2. **Review Report**: Examine complexity recommendations
3. **Expand High-Complexity Tasks**: Auto-expand tasks above threshold
4. **Manual Expansion**: Expand specific tasks with custom parameters
5. **Batch Processing**: Handle multiple tasks efficiently

### MCP Integration
The workflow is fully integrated with the MCP server, providing:
- **expandTask**: Enhanced single task expansion
- **expandTasksBatch**: Batch expansion capabilities
- **expandHighComplexityTasks**: Automated complex task handling

## Error Handling

### Graceful Degradation
- Falls back to default behavior if complexity analysis fails
- Continues batch operations even if individual tasks fail
- Provides detailed error logging and recovery

### Validation
- Validates task existence before expansion
- Checks subtask limits and constraints
- Prevents circular dependencies

## Performance Considerations

### Batching
- Processes complexity analysis in configurable batches
- Avoids overwhelming LLM services
- Provides progress tracking

### Caching
- Leverages existing TaskTree caching
- Stores complexity analysis in context slices
- Reuses analysis results when appropriate

## Future Enhancements

### Planned Features
1. **Learning from Feedback**: Improve complexity scoring based on actual implementation
2. **Template-Based Expansion**: Use predefined templates for common task types
3. **Dependency-Aware Expansion**: Consider task dependencies in expansion strategy
4. **Progressive Expansion**: Expand tasks incrementally as work progresses

### Integration Opportunities
1. **CLI Enhancement**: Add expansion commands to task-master CLI
2. **Web Interface**: Visual complexity analysis and expansion tools
3. **IDE Integration**: Direct expansion from development environment
4. **Analytics Dashboard**: Track expansion effectiveness and patterns

## Testing

The system includes comprehensive tests covering:
- Basic expansion functionality
- Complexity analysis integration
- Batch operations
- Error handling
- Configuration options
- Edge cases and failure scenarios

Run tests with:
```bash
cd packages/core
npm test TaskExpansionService.test.ts
```

## Configuration

### Environment Variables
- Standard LLM configuration (API keys, endpoints)
- Database configuration
- Logging levels

### Service Configuration
Configure the expansion service with appropriate settings for your project:

```typescript
const expansionService = createTaskExpansionService(logger, store, taskService, {
  useComplexityAnalysis: true,
  research: false,
  complexityThreshold: 5,
  defaultSubtasks: 3,
  maxSubtasks: 15,
  forceReplace: false,
  createContextSlices: true,
  projectName: 'My Project',
});
```

This enhanced workflow provides a sophisticated yet user-friendly approach to task breakdown, ensuring that complex tasks are properly decomposed while maintaining flexibility for different project needs. 