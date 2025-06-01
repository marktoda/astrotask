# addDependency

Creates a dependency relationship between two existing tasks, where one task must be completed before another can begin.

## Purpose

This tool enables explicit modeling of task dependencies for proper work sequencing. Dependencies ensure that tasks are completed in the correct order, preventing blocking scenarios and enabling efficient project planning and execution.

## Parameters

- **dependentTaskId**: ID of the task that depends on another task (required)
- **dependencyTaskId**: ID of the task that must be completed first (required)

## Dependency Relationship

```
dependencyTaskId (must finish first) → dependentTaskId (can then start)
```

The dependency relationship means:
- `dependencyTaskId` task must reach `done` status before `dependentTaskId` can be worked on
- `dependentTaskId` is blocked until `dependencyTaskId` is complete
- Tools like `getNextTask` will respect these dependencies when suggesting available work

## Example Calls

### Sequential implementation dependency
```json
{
  "dependentTaskId": "task_implement_frontend",
  "dependencyTaskId": "task_design_api"
}
```
*Frontend implementation depends on API design being completed first*

### Data flow dependency
```json
{
  "dependentTaskId": "task_user_dashboard", 
  "dependencyTaskId": "task_user_authentication"
}
```
*User dashboard depends on authentication system being implemented*

### Infrastructure dependency
```json
{
  "dependentTaskId": "task_deploy_application",
  "dependencyTaskId": "task_setup_database"
}
```
*Application deployment depends on database setup*

### Testing dependency
```json
{
  "dependentTaskId": "task_integration_tests",
  "dependencyTaskId": "task_unit_tests"
}
```
*Integration tests should run after unit tests are complete*

### Knowledge dependency
```json
{
  "dependentTaskId": "task_implement_payment_flow",
  "dependencyTaskId": "task_research_payment_providers"
}
```
*Implementation depends on research being completed*

## Dependency Types

### Technical Dependencies
- **Build order**: Core modules before dependent modules
- **Data dependencies**: Data models before business logic
- **Infrastructure**: Servers before applications

### Logical Dependencies  
- **Research first**: Investigation before implementation
- **Design before build**: Architecture before development
- **Testing sequence**: Unit tests before integration tests

### Resource Dependencies
- **Shared resources**: Database setup before multiple services
- **Expertise**: Senior review before junior implementation
- **External coordination**: Third-party integration before dependent features

## Return Value

Returns confirmation of the created dependency relationship with metadata.

## Dependency Management

### Automatic Enforcement
- `getNextTask` automatically excludes tasks with incomplete dependencies
- Task status changes trigger dependency resolution checks
- Circular dependency detection prevents invalid relationships

### Dependency Chains
Dependencies can form chains: A → B → C
- All upstream dependencies must complete before downstream tasks become available
- Changes to upstream tasks may affect entire dependency chains

### Multiple Dependencies
A single task can depend on multiple other tasks:
```json
// Task C depends on both A and B
{"dependentTaskId": "C", "dependencyTaskId": "A"}
{"dependentTaskId": "C", "dependencyTaskId": "B"}
```

## Best Practices

### Clear Relationships
- **Logical dependencies**: Only create dependencies that represent real blocking relationships
- **Minimal dependencies**: Avoid over-constraining the workflow with unnecessary dependencies
- **Document rationale**: Use task context to explain why dependencies exist

### Granular Tasks
- **Right-sized tasks**: Dependencies work best with appropriately-sized, atomic tasks
- **Clear completion criteria**: Tasks should have obvious done states
- **Avoid mega-tasks**: Large tasks with many dependencies create bottlenecks

### Dependency Planning
- **Map critical path**: Identify the longest chain of dependencies
- **Parallel opportunities**: Look for tasks that can run concurrently
- **Risk mitigation**: Dependencies can isolate risk to specific task chains

## Common Use Cases

### Project Planning
- **Feature dependencies**: Core features before advanced features
- **Phase gates**: Research → Design → Implementation → Testing
- **Risk management**: High-risk tasks isolated from critical path

### Development Workflows
- **Code dependencies**: Shared libraries before consuming applications
- **Environment setup**: Development environment before application code
- **Review processes**: Code review before deployment

### Team Coordination
- **Expertise dependencies**: Senior architect review before implementation
- **Resource coordination**: Shared component development before multiple integrations
- **External dependencies**: Third-party API integration before dependent features

## Troubleshooting Dependencies

### Circular Dependencies
If you try to create A → B when B → A already exists, the system should prevent this invalid state.

### Overly Constrained Workflows
If too many dependencies exist, consider:
- Breaking large tasks into smaller, more independent pieces
- Removing non-essential dependencies
- Creating parallel work streams where possible

### Blocked Progress
If many tasks are blocked by dependencies:
- Focus team effort on dependency-blocking tasks
- Consider if dependencies accurately reflect real requirements
- Look for opportunities to work around or eliminate blocking dependencies 