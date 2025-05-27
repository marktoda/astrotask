# @astrolabe/mcp

MCP (Model Context Protocol) server for Astrolabe, enabling AI agents to interact with the task management system through standardized tools and interfaces.

## Overview

The `@astrolabe/mcp` package implements a Model Context Protocol server that exposes Astrolabe's task management capabilities to AI agents. It provides a set of well-defined tools that agents can use to create, update, query, and manage tasks in a structured and type-safe manner.

## Features

- **🤖 AI Agent Integration**: Full MCP compatibility for seamless AI agent interaction
- **🛠️ Rich Tool Set**: Comprehensive tools for task lifecycle management
- **🔒 Type Safety**: Input validation and type checking for all operations
- **📊 Context-Aware**: Intelligent task context bundling for agents
- **🔄 Real-time Operations**: Live task management with immediate feedback
- **📋 Hierarchical Support**: Full support for nested tasks and complex relationships

## Installation

```bash
pnpm add @astrolabe/mcp

# Or with npm
npm install @astrolabe/mcp

# Or with yarn
yarn add @astrolabe/mcp
```

## Quick Start

### As a Standalone Server

```bash
# Start the MCP server
npx @astrolabe/mcp

# Or with custom configuration
npx @astrolabe/mcp --database-path ./custom-tasks.db --port 3001
```

### Programmatic Usage

```typescript
import { createMCPServer } from '@astrolabe/mcp';
import { createDatabase } from '@astrolabe/core';

// Create database and MCP server
const store = createDatabase({ path: './tasks.db' });
const server = createMCPServer({ store });

// Start the server
await server.start();
console.log('MCP server running on stdio');
```

### With Cursor IDE

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "astrolabe": {
      "command": "npx",
      "args": ["@astrolabe/mcp"],
      "env": {
        "DATABASE_PATH": "./tasks.db"
      }
    }
  }
}
```

## Available Tools

The MCP server exposes the following tools for AI agents:

### Task Management

#### `listTasks`

List tasks with optional filtering.

**Parameters:**
- `status` (optional): Filter by task status (`pending`, `in-progress`, `done`, `cancelled`)
- `parentId` (optional): Filter by parent task ID
- `includeSubtasks` (optional): Include nested subtasks in results

**Example:**
```json
{
  "name": "listTasks",
  "arguments": {
    "status": "pending",
    "includeSubtasks": true
  }
}
```

#### `createTask`

Create a new task.

**Parameters:**
- `title` (required): Task title
- `description` (optional): Detailed task description
- `status` (optional): Initial status (default: `pending`)
- `parentId` (optional): Parent task for subtasks
- `prd` (optional): Product Requirements Document content
- `contextDigest` (optional): Context digest for AI agents

**Example:**
```json
{
  "name": "createTask",
  "arguments": {
    "title": "Implement user authentication",
    "description": "Add JWT-based authentication with refresh token support",
    "status": "pending"
  }
}
```

#### `updateTask`

Update an existing task.

**Parameters:**
- `id` (required): Task ID to update
- `title` (optional): New task title
- `description` (optional): New task description
- `status` (optional): New task status
- `parentId` (optional): New parent task ID
- `prd` (optional): New PRD content
- `contextDigest` (optional): New context digest

**Example:**
```json
{
  "name": "updateTask",
  "arguments": {
    "id": "A",
    "status": "done",
    "description": "Completed: Added JWT auth with bcrypt password hashing"
  }
}
```

#### `deleteTask`

Delete a task.

**Parameters:**
- `id` (required): Task ID to delete
- `cascade` (optional): Whether to delete all subtasks (default: `false`)

**Example:**
```json
{
  "name": "deleteTask",
  "arguments": {
    "id": "A",
    "cascade": true
  }
}
```

#### `completeTask`

Mark a task as complete. This is a convenience tool that sets status to `done`.

**Parameters:**
- `id` (required): Task ID to complete

**Example:**
```json
{
  "name": "completeTask",
  "arguments": {
    "id": "A"
  }
}
```

#### `getTaskContext`

Retrieve a task with its full context including related tasks.

**Parameters:**
- `id` (required): Task ID to get context for
- `includeAncestors` (optional): Include parent tasks (default: `false`)
- `includeDescendants` (optional): Include child tasks (default: `false`)
- `maxDepth` (optional): Maximum depth for hierarchical inclusion (default: `3`)

**Example:**
```json
{
  "name": "getTaskContext",
  "arguments": {
    "id": "A",
    "includeAncestors": true,
    "includeDescendants": true,
    "maxDepth": 5
  }
}
```

## Configuration

### Environment Variables

Configure the MCP server through environment variables:

```bash
# Database configuration
DATABASE_PATH=./tasks.db
DATABASE_ENCRYPTED=true
DATABASE_KEY=your-encryption-key

# Logging configuration
LOG_LEVEL=info
NODE_ENV=production

# Server configuration
MCP_SERVER_NAME=astrolabe
MCP_SERVER_VERSION=1.0.0
```

### Command Line Options

```bash
npx @astrolabe/mcp --help

Options:
  --database-path <path>    Database file path (default: ./tasks.db)
  --encrypted              Enable database encryption
  --log-level <level>      Log level (debug|info|warn|error)
  --help                   Show help information
  --version                Show version information
```

## Integration Examples

### Cursor IDE Integration

Configure Cursor to use Astrolabe MCP server:

1. Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "astrolabe": {
      "command": "npx",
      "args": ["@astrolabe/mcp"],
      "env": {
        "DATABASE_PATH": "./tasks.db",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

2. Restart Cursor and the MCP server will be available for AI interactions.

### Claude Desktop Integration

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "astrolabe": {
      "command": "npx",
      "args": ["@astrolabe/mcp"],
      "env": {
        "DATABASE_PATH": "/path/to/your/tasks.db"
      }
    }
  }
}
```

### Custom AI Agent Integration

```python
# Python example using MCP client
import asyncio
from mcp import Client

async def interact_with_astrolabe():
    client = Client("npx @astrolabe/mcp")
    
    # Create a new task
    result = await client.call_tool("createTask", {
        "title": "Review pull request #123",
        "description": "Review the authentication changes",
        "status": "pending"
    })
    
    task_id = result["id"]
    
    # Mark task as complete
    await client.call_tool("completeTask", {
        "id": task_id
    })
    
    # List all completed tasks
    completed = await client.call_tool("listTasks", {
        "status": "done"
    })
    
    print(f"Completed {len(completed)} tasks")

asyncio.run(interact_with_astrolabe())
```

## Error Handling

The MCP server provides structured error responses:

```json
{
  "error": {
    "code": "INVALID_PARAMS",
    "message": "Task title is required",
    "data": {
      "field": "title",
      "receivedValue": null
    }
  }
}
```

Common error codes:
- `INVALID_PARAMS`: Invalid parameters provided
- `NOT_FOUND`: Requested task/resource not found
- `VALIDATION_ERROR`: Data validation failed
- `DATABASE_ERROR`: Database operation failed
- `INTERNAL_ERROR`: Unexpected server error

## Performance Considerations

- **Connection Pooling**: The server reuses database connections efficiently
- **Query Optimization**: Database queries are optimized for common patterns
- **Memory Management**: Context retrieval limits depth to prevent memory issues
- **Concurrent Operations**: Multiple agents can safely operate simultaneously

## Security

- **Input Validation**: All inputs are validated using Zod schemas
- **SQL Injection Protection**: All database queries use parameterized statements
- **Encryption Support**: Optional database encryption for sensitive data
- **Access Control**: Task access is scoped to the configured database

## Development

### Running in Development

```bash
# Clone the repository
git clone <repository-url>
cd astrolabe

# Install dependencies
pnpm install

# Start development server with hot reload
pnpm --filter @astrolabe/mcp dev

# Run tests
pnpm --filter @astrolabe/mcp test
```

### Custom Tool Development

Extend the MCP server with custom tools:

```typescript
import { MCPHandler, HandlerContext } from '@astrolabe/mcp';

class CustomTaskHandler implements MCPHandler {
  constructor(public readonly context: HandlerContext) {}

  async handleCustomOperation(params: CustomParams) {
    // Your custom logic here
    const result = await this.context.taskService.customOperation(params);
    return result;
  }
}

// Register the custom handler
server.addTool('customTask', CustomTaskHandler);
```

## Debugging

Enable debug logging to troubleshoot issues:

```bash
# Enable debug logs
DEBUG=astrolabe:* npx @astrolabe/mcp

# Or set log level
LOG_LEVEL=debug npx @astrolabe/mcp
```

The debug output includes:
- Incoming MCP requests and responses
- Database query execution
- Task service operations
- Error stack traces

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes with tests
4. Ensure all quality checks pass: `pnpm verify`
5. Submit a pull request

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Related Packages

- [`@astrolabe/core`](../core/README.md) - Core task management library
- [`@astrolabe/cli`](../cli/README.md) - Command-line interface

## Support

- [GitHub Issues](https://github.com/astrolabe/astrolabe/issues) - Bug reports and feature requests
- [Documentation](../../docs/) - Comprehensive guides and API reference
- [Examples](../../docs/examples/) - Usage examples and tutorials