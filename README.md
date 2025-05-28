# Astrolabe

A local-first, MCP-compatible task navigation platform for humans and AI agents.

## Overview

Astrolabe is a modern task management and navigation platform that prioritizes **offline-first** functionality while maintaining seamless integration with **Model Context Protocol (MCP)** for AI agent collaboration. Built with TypeScript and featuring encrypted local storage, Astrolabe enables productive task management workflows both independently and with AI assistance.

Whether you're a developer managing complex projects, a team coordinating work, or an AI agent assisting with task planning, Astrolabe provides the tools you need with complete data ownership and offline capabilities.

## ✨ Key Features

### 🏠 **Local-First Architecture**

- All data stored locally with SQLite database
- Full functionality without internet connectivity
- Optional real-time sync with CRDT-based conflict resolution
- Your data, your control - no vendor lock-in

### 🤖 **AI Agent Integration**

- Native Model Context Protocol (MCP) support
- Structured tools for AI task management
- Context-aware task assistance
- Works with Cursor IDE, Claude Desktop, and custom agents

### 📋 **Hierarchical Task Management**

- Nested tasks with unlimited depth
- Project organization and grouping
- Dependency tracking and workflow management
- Rich metadata and context storage

### 🔒 **Enterprise-Ready**

- SQLCipher encryption for sensitive data
- Type-safe operations with Zod validation
- Comprehensive audit logging
- Performance optimized for large datasets

### 🚀 **Developer Experience**

- TypeScript-first with full type safety
- Multiple interfaces: CLI, API, MCP server
- Comprehensive testing and documentation
- Hot-reload development environment

## 🚀 Quick Start

### For End Users (CLI)

**Note:** Packages are currently in development and not yet published to npm.

```bash
# Clone and set up the development environment
git clone https://github.com/marktoda/astrolabe.git
cd astrolabe
pnpm install
pnpm build

# Use the CLI locally
pnpm cli --help

# Example commands (in development)
pnpm cli task add "Implement user authentication"
pnpm cli task list
```

### For Developers (API)

**Note:** API is currently in development. Basic usage:

```typescript
import { TaskService } from "@astrolabe/core";

// Initialize task service
const taskService = new TaskService();

// Create hierarchical tasks
const feature = await taskService.createTask({
  title: "Build authentication system",
  description: "Implement JWT-based authentication",
});

const subtask = await taskService.createTask({
  title: "Design user schema",
  parentId: feature.id,
});

// Query with full context
const context = await taskService.getTaskContext(feature.id);
```

### For AI Agents (MCP)

**Note:** MCP server is currently in development.

```bash
# Build and start MCP server locally
cd packages/mcp
pnpm build
node dist/index.js
```

Configure in Cursor IDE (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "astrolabe": {
      "command": "node",
      "args": ["path/to/astrolabe/packages/mcp/dist/index.js"],
      "env": { "DATABASE_PATH": "./tasks.db" }
    }
  }
}
```

AI agents can then use structured tools:

```json
{
  "name": "createTask",
  "arguments": {
    "title": "Refactor authentication module",
    "description": "Improve error handling and add rate limiting",
    "status": "pending"
  }
}
```

## 🏗️ Architecture

Astrolabe is built as a TypeScript monorepo with three core packages:

```
┌─────────────────────────────────────────────────┐
│                   Interfaces                    │
├─────────────────┬─────────────────┬─────────────┤
│   📱 CLI App    │  🤖 MCP Server  │  📚 API     │
│ React/Ink UI    │  AI Integration │  Library    │
├─────────────────┴─────────────────┴─────────────┤
│              🧠 @astrolabe/core                  │
│        TaskService • Database • Schemas         │
├─────────────────────────────────────────────────┤
│                💾 Storage Layer                 │
│         SQLite • ElectricSQL • Encryption       │
└─────────────────────────────────────────────────┘
```

### Core Packages

- **[@astrolabe/core](packages/core/)** - Core task management library with database, services, and type-safe schemas
- **[@astrolabe/mcp](packages/mcp/)** - Model Context Protocol server for AI agent integration
- **[@astrolabe/cli](packages/cli/)** - Beautiful command-line interface built with React and Ink

## 📖 Documentation

### Getting Started

- **[Getting Started Guide](docs/guides/getting-started.md)** - Complete setup and usage guide
- **[Installation Options](docs/guides/getting-started.md#installation-options)** - Choose the right setup for your use case
- **[Core Concepts](docs/guides/getting-started.md#core-concepts)** - Understanding tasks, projects, and hierarchies

### API Reference

- **[Core API Documentation](docs/api/core-api.md)** - Complete API reference for `@astrolabe/core`
- **[TaskService API](docs/api/task-service.md)** - Detailed TaskService methods and examples
- **[Database API](docs/api/core-api.md#database)** - Database operations and configuration

### Package Documentation

- **[Core Package](packages/core/README.md)** - Database, services, schemas, and utilities
- **[MCP Package](packages/mcp/README.md)** - AI agent integration and MCP tools
- **[CLI Package](packages/cli/readme.md)** - Command-line interface and usage

### Development

- **[Contributing Guide](docs/guides/contributing.md)** - How to contribute to Astrolabe
- **[Architecture Overview](docs/design.md)** - Technical design and architecture decisions
- **[Testing Guide](test/README.md)** - Testing strategies and best practices

## 🛠️ Installation

### Prerequisites

- **Node.js** 22.0.0 or higher
- **pnpm** (recommended) or npm/yarn
- **SQLite** 3.40+ (usually included with Node.js)

### Development Installation

**Note:** Packages are not yet published to npm. Use development setup:

```bash
# Clone repository
git clone https://github.com/marktoda/astrolabe.git
cd astrolabe

# Install dependencies (requires pnpm)
pnpm install

# Build all packages
pnpm build

# Run CLI locally
pnpm cli --help
```

### Development Setup

```bash
# Clone repository
git clone https://github.com/marktoda/astrolabe.git
cd astrolabe

# Install dependencies (requires pnpm)
pnpm install

# Build all packages
pnpm build

# Run development servers
pnpm dev
```

## 🎯 Use Cases

### Project Management

```bash
# Create project structure
astrolabe create "Mobile App Redesign"
astrolabe create "User Research" --project proj_123
astrolabe create "UI Design" --project proj_123 --depends-on task_456
astrolabe create "Implementation" --project proj_123 --depends-on task_789
```

### Development Workflow

```typescript
// Track development tasks programmatically
const epic = await taskService.createTask({
  title: "User Authentication Epic",
  description: "Complete user auth system with JWT",
});

const tasks = await Promise.all([
  taskService.createTask({
    title: "Design auth API",
    parentId: epic.id,
    status: "pending",
  }),
  taskService.createTask({
    title: "Implement JWT service",
    parentId: epic.id,
    status: "pending",
  }),
  taskService.createTask({
    title: "Add auth middleware",
    parentId: epic.id,
    status: "pending",
  }),
]);
```

### AI-Assisted Planning

```json
// AI agent breaks down complex tasks
{
  "name": "createTask",
  "arguments": {
    "title": "Implement microservice architecture",
    "description": "Break monolith into services with proper API gateway"
  }
}

// AI creates detailed subtasks automatically
{
  "name": "getTaskContext",
  "arguments": {
    "id": "task_complex_123",
    "includeDescendants": true
  }
}
```

## 🌟 Why Astrolabe?

### **Local-First Philosophy**

Your tasks and data remain on your machine. Work offline, sync when you want, and maintain complete control over your information.

### **AI-Native Design**

Built from the ground up for AI collaboration. Structured data, semantic context, and standardized protocols make AI assistance natural and powerful.

### **Developer-Friendly**

Type-safe APIs, comprehensive documentation, and modern tooling make integration straightforward whether you're building apps or automating workflows.

### **Scalable Architecture**

From personal todo lists to enterprise project management, Astrolabe scales with your needs while maintaining performance and reliability.

## 📊 Project Status

**Current Version:** 0.1.0 (Development)

**Milestone Progress:**

- ✅ **M0 - Foundation** (v0.1.0): Core architecture, database, basic APIs
- 🔄 **M1 - CLI & MCP** (v0.2.0): Full CLI interface, MCP server integration
- 📋 **M2 - Sync & Web** (v0.3.0): Real-time sync, web interface
- 📱 **M3 - Mobile & Advanced** (v1.0.0): Mobile apps, advanced AI features

**Package Status:**

- `@astrolabe/core` - 🔄 **In Development** - Core functionality implemented, testing in progress
- `@astrolabe/mcp` - 🔄 **In Development** - Basic MCP server implemented, expanding functionality
- `@astrolabe/cli` - 🔄 **In Development** - CLI framework in place, commands being implemented

## 🤝 Contributing

We welcome contributions! Astrolabe is built by developers, for developers.

### Quick Contributing Steps

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Make** your changes with tests
4. **Run** verification (`pnpm verify`)
5. **Submit** a pull request

### Areas for Contribution

- 🐛 **Bug fixes** and performance improvements
- 📚 **Documentation** and examples
- 🧪 **Testing** and quality assurance
- ✨ **New features** and integrations
- 🌐 **Translations** and accessibility

See our **[Contributing Guide](docs/guides/contributing.md)** for detailed information.

## 📋 Roadmap

### Short Term (v0.2.0)

- [ ] Enhanced CLI with interactive modes
- [ ] Additional MCP tools for complex workflows
- [ ] Performance optimizations for large datasets
- [ ] Import/export functionality

### Medium Term (v0.3.0)

- [ ] Real-time sync with ElectricSQL
- [ ] Web interface for task management
- [ ] Team collaboration features
- [ ] Advanced search and filtering

### Long Term (v1.0.0)

- [ ] Mobile applications (iOS/Android)
- [ ] Advanced AI integrations
- [ ] Plugin ecosystem
- [ ] Enterprise features (SSO, audit logs)

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with these amazing technologies:

- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Zod](https://zod.dev/)** - Runtime type validation
- **[SQLite](https://sqlite.org/)** - Embedded database
- **[ElectricSQL](https://electric-sql.com/)** - Local-first sync
- **[Model Context Protocol](https://modelcontextprotocol.io/)** - AI agent integration
- **[React](https://react.dev/)** & **[Ink](https://github.com/vadimdemedes/ink)** - CLI interface

## 📞 Support & Community

- 📖 **Documentation**: [docs/](docs/) - Comprehensive guides and API reference
- 🐛 **Issues**: [GitHub Issues](https://github.com/marktoda/astrolabe/issues) - Bug reports and feature requests
- 💬 **Discussions**: [GitHub Discussions](https://github.com/marktoda/astrolabe/discussions) - Questions and community

---

**Ready to get started?** Check out the **[Getting Started Guide](docs/guides/getting-started.md)** or jump right in with `git clone https://github.com/marktoda/astrolabe.git && cd astrolabe && pnpm install && pnpm build`!

