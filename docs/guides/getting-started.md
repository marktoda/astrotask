# Getting Started with Astrolabe

Welcome to Astrolabe! This guide will help you get up and running with the local-first, MCP-compatible task management platform.

## What is Astrolabe?

Astrolabe is a modern task management platform designed for both humans and AI agents. It features:

- **Local-First Architecture**: All your data stays on your machine with SQLite storage
- **Multiple Database Backends**: SQLite (recommended) or PGLite for different use cases
- **Offline Capabilities**: Full functionality without internet
- **AI Agent Integration**: Native MCP support for AI collaboration
- **Hierarchical Tasks**: Organize work with nested task structures
- **Type-Safe**: Built with TypeScript for reliability

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 22.0.0 or higher
- **pnpm** (recommended) or npm/yarn
- Basic familiarity with command-line tools

## Database Configuration

Astrolabe supports multiple database backends that you can configure via the `DATABASE_URI` environment variable:

### SQLite (Recommended for CLI/MCP)

```bash
# SQLite with explicit protocol
export DATABASE_URI="sqlite://./data/astrotask.db"

# Auto-detection via file extension
export DATABASE_URI="./data/astrotask.sqlite"
export DATABASE_URI="./data/astrotask.db"
```

**Benefits:** Native performance, concurrent access, process-safe locking

### PGLite (For Browser/Testing)

```bash
# Browser storage (IndexedDB)
export DATABASE_URI="idb://astrotask"

# In-memory for testing
export DATABASE_URI="memory://test"

# File-based PGLite
export DATABASE_URI="./data/astrotask-pglite"
```

**Benefits:** Browser compatibility, PostgreSQL feature compatibility

## Installation Options

### Option 1: Development Setup (Currently Required)

**Note:** Packages are not yet published to npm. Use development setup:

```bash
# Clone the repository
git clone https://github.com/marktoda/astrotask.git
cd astrotask

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Configure database (optional - uses SQLite by default)
export DATABASE_URI="sqlite://./data/astrotask.db"
```

### Option 2: Using the Core Library (For Developers)

Once published, you'll be able to install:

```bash
# Add to your project (future)
pnpm add @astrotask/core

# For MCP server functionality (future)
pnpm add @astrotask/mcp
```

## Quick Start: CLI

### 1. Configure Your Environment

```bash
# Set up database (optional - defaults to ./data/astrotask.db)
export DATABASE_URI="sqlite://./data/astrotask.db"
export DB_VERBOSE=false

# Alternative: create .env file
echo "DATABASE_URI=sqlite://./data/astrotask.db" > .env
echo "DB_VERBOSE=false" >> .env
```

### 2. Create Your First Tasks

```bash
# Create a simple task (using development CLI)
pnpm cli task add "Set up development environment"

# Create a task with description
pnpm cli task add "Implement user authentication" \
  --description "Add JWT-based auth with refresh tokens"

# Create a subtask with parent
pnpm cli task add "Write unit tests" --parent-id TASK_ID
```

### 3. View and Manage Tasks

```bash
# List all active tasks (pending + in-progress)
pnpm cli task list

# Show all tasks including completed
pnpm cli task list --show-all

# Filter by status
pnpm cli task list --status done

# Show task details
pnpm cli task show TASK_ID

# Update task status
pnpm cli task update-status TASK_ID --status in-progress

# Launch interactive dashboard
pnpm cli dashboard
```

## Quick Start: Programmatic Usage

### 1. Basic Task Management

```typescript
import { createDatabase } from '@astrotask/core';

// Initialize database (defaults to SQLite)
const store = await createDatabase({
  dataDir: './data/astrotask.db',
  verbose: false
});

// Create a task
const task = await store.addTask({
  title: 'Implement user authentication',
  description: 'Add JWT-based authentication system',
  status: 'pending',
  priority: 'high'
});

console.log('Created task:', task.id);

// List all tasks
const tasks = await store.listTasks();
console.log('Total tasks:', tasks.length);

// Update task status
const updated = await store.updateTaskStatus(task.id, 'in-progress');

// Get task details
const taskDetails = await store.getTask(task.id);
```

### 2. Working with Hierarchical Tasks

```typescript
// Create parent task
const parentTask = await store.addTask({
  title: 'Build authentication system',
  priority: 'high'
});

// Create subtasks
const subtask1 = await store.addTask({
  title: 'Design user schema',
  parentId: parentTask.id,
  priority: 'medium'
});

const subtask2 = await store.addTask({
  title: 'Implement JWT tokens',
  parentId: parentTask.id,
  priority: 'medium'
});

// Get subtasks
const subtasks = await store.listSubtasks(parentTask.id);
console.log('Subtasks:', subtasks.length);

// Add context to tasks
await store.addContextSlice({
  taskId: parentTask.id,
  title: 'Implementation Notes',
  description: 'Use bcrypt for password hashing, JWT for tokens'
});
```

## Quick Start: MCP Integration

### 1. Set Up MCP Server

For AI agent integration, build and start the MCP server:

```bash
# Build the MCP server (development)
cd packages/mcp
pnpm build

# Configure database for MCP
export DATABASE_URI="sqlite://./data/astrotask-mcp.db"
export DB_VERBOSE=false

# Start MCP server
node dist/index.js
```

### 2. Configure with Cursor IDE

Create `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "astrotask": {
      "command": "npx",
      "args": ["@astrotask/mcp"],
      "env": {
        "DATABASE_URI": "sqlite://./data/astrotask.db",
        "DB_VERBOSE": "false",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### 3. Use with AI Agents

Once configured, AI agents can interact with your tasks using these MCP tools:

```json
{
  "name": "addTasks",
  "arguments": {
    "tasks": [{
      "title": "Refactor authentication module",
      "description": "Improve code structure and add error handling",
      "status": "pending",
      "priority": "medium"
    }]
  }
}
```

Available MCP tools:
- `getNextTask` - Get next available task to work on
- `addTasks` - Create single or multiple tasks with hierarchy
- `listTasks` - List tasks with filtering options
- `updateStatus` - Update task status (pending, in-progress, done, etc.)
- `addTaskContext` - Add context information to tasks
- `addDependency` - Create dependencies between tasks

## Core Concepts

### Tasks

Tasks are the fundamental unit of work in Astrolabe:

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'done' | 'cancelled';
  parentId?: string;  // For subtasks
  projectId?: string; // Project assignment
  createdAt: Date;
  updatedAt: Date;
}
```

### Task Hierarchy

Tasks can be organized hierarchically:

```
📋 Build Authentication System
├── 🔧 Design user schema
├── 🔑 Implement JWT tokens
│   ├── 📝 Create token service
│   └── 🧪 Write token tests
└── 🔒 Add password hashing
```

### Projects

Projects group related tasks:

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
}
```

### Context Slices

For AI agents, context slices provide relevant information:

```typescript
interface ContextSlice {
  taskId: string;
  content: string;
  metadata: Record<string, any>;
}
```

## Configuration

### Environment Variables

Configure Astrolabe through environment variables:

```bash
# Database Configuration
DATABASE_URI="sqlite://./data/astrotask.db"    # SQLite database (recommended)
# DATABASE_URI="idb://astrotask"              # PGLite browser storage  
# DATABASE_URI="memory://test"                # PGLite in-memory (testing)

# Database Performance Settings
DB_VERBOSE=false                              # Enable SQL query logging
DB_TIMEOUT=5000                              # Query timeout in milliseconds

# Application Settings
NODE_ENV=development                         # Runtime environment
LOG_LEVEL=info                              # Log verbosity level
PORT=3000                                   # Application port (if applicable)

# MCP Server Settings (when using MCP)
LOG_LEVEL=info                              # MCP server log level
```

### Configuration File

Create a `.env` file in your project root for persistent configuration:

```bash
# .env file
DATABASE_URI=sqlite://./data/astrotask.db
DB_VERBOSE=false
DB_TIMEOUT=20000
LOG_LEVEL=info
NODE_ENV=development
```

### Database Selection Guide

Choose the right database backend for your use case:

**SQLite (Recommended for CLI/MCP):**
- Best for: CLI usage, MCP servers, production deployments
- Benefits: Native performance, concurrent access, process-safe
- Configuration: `DATABASE_URI="sqlite://./path/to/database.db"`

**PGLite (For Browser/Testing):**
- Best for: Browser applications, development, testing
- Benefits: Browser compatibility, PostgreSQL feature set
- Configuration: `DATABASE_URI="idb://astrotask"` or `DATABASE_URI="memory://test"`

## Common Workflows

### 1. Daily Task Management

```bash
# Start your day
astrotask list --status pending

# Pick a task to work on
astrotask start task_123

# Update progress
astrotask update task_123 --description "Added user model"

# Complete the task
astrotask complete task_123 --notes "Implemented with validation"
```

### 2. Project Planning

```bash
# Create project
astrotask project create "Q1 Feature Release"

# Break down into tasks
astrotask create "User authentication" --project proj_123
astrotask create "Dashboard redesign" --project proj_123
astrotask create "Performance optimization" --project proj_123

# Create subtasks
astrotask create "Login form" --parent task_456
astrotask create "Password reset" --parent task_456
```

### 3. Team Collaboration

```bash
# Export tasks for sharing
astrotask export --format json --output team-tasks.json

# Import tasks from teammate
astrotask import teammate-tasks.json

# Sync with shared database (if using sync)
astrotask sync --remote https://sync.example.com
```

## Best Practices

### Task Organization

1. **Use Descriptive Titles**: Make task purposes clear
2. **Break Down Large Tasks**: Use subtasks for complex work
3. **Add Context**: Include relevant details in descriptions
4. **Set Realistic Statuses**: Keep status updates current

### Project Structure

1. **Group Related Work**: Use projects for cohesive features
2. **Maintain Hierarchy**: Organize tasks logically
3. **Regular Reviews**: Periodically review and update tasks
4. **Archive Completed**: Keep workspace clean

### AI Integration

1. **Provide Context**: Use context slices for better AI assistance
2. **Clear Descriptions**: Help AI understand task requirements
3. **Regular Updates**: Keep task status current for AI awareness
4. **Use PRD Fields**: Include requirements for AI reference

## Troubleshooting

### Common Issues

**Database locked error:**
```bash
# Check for running processes
astrotask status --verbose

# Force unlock if needed
astrotask config database.force-unlock true
```

**Permission errors:**
```bash
# Check file permissions
ls -la .astrotask.json

# Reset configuration
astrotask config --reset
```

**MCP connection issues:**
```bash
# Check MCP server status
DEBUG=astrotask:* npx @astrotask/mcp

# Verify configuration
cat .cursor/mcp.json
```

### Getting Help

- **Documentation**: Check the [full documentation](../README.md)
- **API Reference**: See [API docs](../api/core-api.md)
- **Examples**: Browse [example projects](../examples/)
- **Issues**: Report bugs on [GitHub Issues](https://github.com/astrotask/astrotask/issues)

## Next Steps

Now that you're set up, explore these advanced features:

1. **[MCP Integration Guide](./mcp-integration.md)** - Deep dive into AI agent integration
2. **[Advanced Task Management](./advanced-tasks.md)** - Complex workflows and patterns
3. **[Database Management](./database-guide.md)** - Backup, sync, and migration
4. **[API Development](./api-development.md)** - Building applications with Astrolabe
5. **[Contributing Guide](./contributing.md)** - Help improve Astrolabe

## Examples

### Simple Todo App

```typescript
import { createDatabase, TaskService } from '@astrotask/core';

class TodoApp {
  private taskService: TaskService;

  constructor() {
    const store = createDatabase({ path: './todos.db' });
    this.taskService = new TaskService(store);
  }

  async addTodo(title: string) {
    return await this.taskService.createTask({
      title,
      status: 'pending'
    });
  }

  async completeTodo(id: string) {
    return await this.taskService.updateTask(id, {
      status: 'done'
    });
  }

  async listTodos() {
    return await this.taskService.listTasks({
      status: 'pending'
    });
  }
}

// Usage
const app = new TodoApp();
await app.addTodo('Buy groceries');
await app.addTodo('Walk the dog');
const todos = await app.listTodos();
console.log('Pending todos:', todos.length);
```

### Project Management Dashboard

```typescript
import { createDatabase, TaskService } from '@astrotask/core';

class ProjectDashboard {
  private taskService: TaskService;

  constructor() {
    const store = createDatabase({ path: './projects.db' });
    this.taskService = new TaskService(store);
  }

  async getProjectStats(projectId: string) {
    const tasks = await this.taskService.listTasks({ projectId });
    
    const stats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      inProgress: tasks.filter(t => t.status === 'in-progress').length,
      completed: tasks.filter(t => t.status === 'done').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length
    };

    return {
      ...stats,
      completionRate: stats.total > 0 ? stats.completed / stats.total : 0
    };
  }

  async getTaskTree(projectId: string) {
    const tasks = await this.taskService.listTasks({ projectId });
    const rootTasks = tasks.filter(t => !t.parentId);
    
    return Promise.all(
      rootTasks.map(task => 
        this.taskService.getTaskTree(task.id)
      )
    );
  }
}
```

Welcome to Astrolabe! Start building better task management workflows today. 
