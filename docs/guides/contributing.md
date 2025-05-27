# Contributing to Astrolabe

Thank you for your interest in contributing to Astrolabe! This guide will help you get started with contributing to our local-first, MCP-compatible task management platform.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js** 18.0.0 or higher
- **pnpm** 8.0.0 or higher (required for workspace management)
- **Git** 2.40 or higher
- **SQLite** 3.40 or higher
- Basic familiarity with TypeScript, React, and SQL

### Optional Tools

- **Nix** (for reproducible development environment)
- **Cursor IDE** (for AI-assisted development)
- **Docker** (for containerized testing)

## Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/astrolabe.git
cd astrolabe

# Add upstream remote
git remote add upstream https://github.com/astrolabe/astrolabe.git
```

### 2. Install Dependencies

```bash
# Install all dependencies for the monorepo
pnpm install

# Verify installation
pnpm --version
node --version
```

### 3. Set Up Development Environment

#### Option A: Using Nix (Recommended)

```bash
# Enable direnv (if not already installed)
direnv allow

# This automatically sets up the development environment
# with all required tools and dependencies
```

#### Option B: Manual Setup

```bash
# Install Biome globally (for linting/formatting)
pnpm add -g @biomejs/biome

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### 4. Build and Verify

```bash
# Build all packages
pnpm build

# Run type checking
pnpm type-check

# Run tests
pnpm test

# Run full verification
pnpm verify
```

## Project Structure

```
astrolabe/
├── packages/                 # Monorepo packages
│   ├── core/                # Core library (@astrolabe/core)
│   │   ├── src/
│   │   │   ├── database/    # Database layer
│   │   │   ├── services/    # Business logic
│   │   │   ├── schemas/     # Zod schemas
│   │   │   ├── utils/       # Utilities
│   │   │   └── config/      # Configuration
│   │   ├── test/            # Core tests
│   │   └── dist/            # Compiled output
│   ├── mcp/                 # MCP server (@astrolabe/mcp)
│   │   ├── src/
│   │   │   ├── handlers/    # MCP tool handlers
│   │   │   └── index.ts     # Server entry point
│   │   └── dist/
│   └── cli/                 # CLI interface (@astrolabe/cli)
│       ├── source/          # CLI source code
│       └── dist/
├── docs/                    # Documentation
│   ├── api/                # API documentation
│   ├── guides/             # User guides
│   └── examples/           # Code examples
├── scripts/                # Build and utility scripts
├── .cursor/                # Cursor AI configuration
│   └── rules/              # AI agent guidance rules
└── test/                   # Integration tests
```

### Key Files

- `pnpm-workspace.yaml` - Workspace configuration
- `biome.json` - Code formatting and linting rules
- `tsconfig.json` - TypeScript configuration
- `flake.nix` - Nix development environment
- `.taskmasterconfig` - Task Master AI configuration

## Development Workflow

### 1. Create a Feature Branch

```bash
# Sync with upstream
git fetch upstream
git checkout main
git merge upstream/main

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/issue-description
```

### 2. Make Changes

Follow these guidelines when making changes:

- **Small, focused commits**: Each commit should represent a single logical change
- **Clear commit messages**: Use conventional commit format
- **Test your changes**: Ensure all tests pass
- **Update documentation**: Keep docs in sync with code changes

### 3. Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Feature additions
git commit -m "feat(core): add task context retrieval"

# Bug fixes
git commit -m "fix(mcp): handle null task descriptions"

# Documentation updates
git commit -m "docs(api): update TaskService examples"

# Breaking changes
git commit -m "feat(core)!: change task status enum values"

# Other types: build, ci, docs, style, refactor, test, chore
```

### 4. Quality Checks

Before pushing, run the full verification suite:

```bash
# Run all quality checks
pnpm verify

# This runs:
# - TypeScript compilation
# - Linting with auto-fix
# - Code formatting with auto-fix
# - All tests
```

### 5. Push and Create PR

```bash
# Push your branch
git push origin feature/your-feature-name

# Create a pull request on GitHub
# Use the PR template and fill in all sections
```

## Code Standards

### TypeScript Guidelines

- **Strict TypeScript**: All code must pass strict type checking
- **No `any` types**: Use proper typing or `unknown` with type guards
- **Explicit return types**: For public APIs and complex functions
- **Runtime validation**: Use Zod schemas for data validation

```typescript
// ✅ Good
export async function createTask(data: CreateTask): Promise<Task> {
  const validated = createTaskSchema.parse(data);
  return await this.store.create(validated);
}

// ❌ Bad
export async function createTask(data: any): Promise<any> {
  return await this.store.create(data);
}
```

### Code Style

We use Biome for consistent formatting:

```typescript
// ✅ Good - follows Biome rules
const task: Task = {
  id: 'task_123',
  title: 'Implement feature',
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ❌ Bad - inconsistent formatting
const task:Task={id:"task_123",title:"Implement feature",status:"pending"};
```

### Architecture Principles

1. **Local-First**: All functionality must work offline
2. **Type Safety**: Runtime validation with compile-time types
3. **Immutable Data**: Prefer readonly and const assertions
4. **Error Handling**: Structured errors with context
5. **Performance**: Optimize for common use cases

### Database Guidelines

- **Migrations**: All schema changes require migrations
- **Transactions**: Use transactions for multi-step operations
- **Indexing**: Add indexes for common query patterns
- **Validation**: Validate data at the schema level

```typescript
// ✅ Good - proper transaction usage
async createTaskWithSubtasks(parentData: CreateTask, subtasks: CreateTask[]) {
  return await this.store.transaction(async (tx) => {
    const parent = await tx.create(parentData);
    const children = await Promise.all(
      subtasks.map(subtask => 
        tx.create({ ...subtask, parentId: parent.id })
      )
    );
    return { parent, children };
  });
}
```

## Testing

### Test Structure

```
test/
├── unit/                   # Unit tests
│   ├── core/              # Core package tests
│   ├── mcp/               # MCP package tests
│   └── cli/               # CLI package tests
├── integration/           # Integration tests
├── e2e/                   # End-to-end tests
└── fixtures/              # Test data and utilities
```

### Writing Tests

Use Vitest for all testing:

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { createDatabase, TaskService } from '@astrolabe/core';

describe('TaskService', () => {
  let taskService: TaskService;

  beforeEach(() => {
    const store = createDatabase({ path: ':memory:' });
    taskService = new TaskService(store);
  });

  test('should create task with valid data', async () => {
    const taskData = {
      title: 'Test task',
      description: 'Test description',
      status: 'pending' as const
    };

    const task = await taskService.createTask(taskData);

    expect(task.id).toBeDefined();
    expect(task.title).toBe(taskData.title);
    expect(task.status).toBe('pending');
    expect(task.createdAt).toBeInstanceOf(Date);
  });

  test('should throw validation error for invalid data', async () => {
    const invalidData = { title: '' }; // Empty title

    await expect(
      taskService.createTask(invalidData as any)
    ).rejects.toThrow('Validation error');
  });
});
```

### Test Guidelines

1. **Test Behavior**: Focus on what the code does, not how
2. **Use Descriptive Names**: Test names should explain the scenario
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Mock External Dependencies**: Use in-memory databases for tests
5. **Test Error Cases**: Include negative test cases

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for specific package
pnpm --filter @astrolabe/core test

# Run with coverage
pnpm test --coverage

# Run specific test file
pnpm test task-service.test.ts
```

## Documentation

### Documentation Standards

1. **API Documentation**: All public APIs must have JSDoc comments
2. **User Guides**: Step-by-step guides for common tasks
3. **Examples**: Working code examples for key features
4. **Architecture Docs**: High-level design documentation

### JSDoc Guidelines

```typescript
/**
 * Creates a new task with validation and automatic timestamp generation.
 * 
 * @param data - Task creation data
 * @param data.title - Task title (required)
 * @param data.description - Optional detailed description
 * @param data.status - Initial status (default: 'pending')
 * @returns Promise that resolves to the created task
 * 
 * @throws {ValidationError} When task data is invalid
 * @throws {DatabaseError} When database operation fails
 * 
 * @example
 * ```typescript
 * const task = await taskService.createTask({
 *   title: 'Implement user authentication',
 *   description: 'Add JWT-based authentication system',
 *   status: 'pending'
 * });
 * ```
 */
async createTask(data: CreateTask): Promise<Task> {
  // Implementation
}
```

### Updating Documentation

When making changes:

1. **Update JSDoc comments** for modified APIs
2. **Update README files** for package changes
3. **Add examples** for new features
4. **Update guides** for workflow changes

## Pull Request Process

### Before Submitting

1. **Sync with upstream**: Ensure your branch is up to date
2. **Run verification**: `pnpm verify` must pass
3. **Update documentation**: Keep docs in sync
4. **Add tests**: New features need test coverage
5. **Check breaking changes**: Document any breaking changes

### PR Template

Use this template for your pull request:

```markdown
## Description
Brief description of the changes and their purpose.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Documentation
- [ ] Code comments updated
- [ ] README updated (if applicable)
- [ ] API documentation updated (if applicable)

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Tests added for new functionality
- [ ] All tests pass
- [ ] Documentation updated
```

### Review Process

1. **Automated Checks**: CI must pass
2. **Code Review**: At least one maintainer review
3. **Testing**: Verify functionality works as expected
4. **Documentation**: Ensure docs are complete and accurate

### Addressing Feedback

- **Be responsive**: Address feedback promptly
- **Ask questions**: If feedback is unclear, ask for clarification
- **Make focused changes**: Address each piece of feedback specifically
- **Update tests**: Modify tests if implementation changes

## Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Changesets

We use [Changesets](https://github.com/changesets/changesets) for release management:

```bash
# Add a changeset for your changes
pnpm changeset

# Follow the prompts to describe your changes
# This creates a file in .changeset/
```

### Release Steps

1. **Create changeset**: Describe your changes
2. **Merge PR**: Changes are merged to main
3. **Automated release**: CI creates release PR
4. **Review and merge**: Maintainers review and merge release PR
5. **Publish**: Packages are automatically published to npm

## Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Discord** (coming soon): Real-time chat with maintainers

### Reporting Issues

When reporting bugs:

1. **Search existing issues**: Check if already reported
2. **Use issue template**: Fill out all sections
3. **Provide reproduction**: Include minimal reproduction case
4. **Include environment**: OS, Node.js version, package versions

### Suggesting Features

For feature requests:

1. **Check roadmap**: See if already planned
2. **Describe use case**: Explain the problem you're solving
3. **Propose solution**: Suggest implementation approach
4. **Consider alternatives**: Discuss other possible solutions

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please read and follow our [Code of Conduct](../CODE_OF_CONDUCT.md).

### Our Standards

- **Be respectful**: Treat everyone with respect and kindness
- **Be inclusive**: Welcome people of all backgrounds and experience levels
- **Be constructive**: Provide helpful feedback and suggestions
- **Be patient**: Remember that everyone is learning

## Recognition

Contributors are recognized in several ways:

- **Contributors list**: All contributors are listed in README
- **Release notes**: Significant contributions are highlighted
- **Maintainer status**: Active contributors may be invited as maintainers

## Resources

### Learning Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Zod Documentation](https://zod.dev/)
- [Vitest Guide](https://vitest.dev/guide/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

### Project Resources

- [Architecture Overview](../design.md)
- [API Documentation](../api/)
- [User Guides](../guides/)
- [Code Examples](../examples/)

Thank you for contributing to Astrolabe! Your contributions help make task management better for everyone. 