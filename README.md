# Astrolabe

A local-first, MCP-compatible task-navigation platform for humans + AI agents.

## Overview

Astrolabe is a modern task management and navigation platform that prioritizes offline-first functionality while maintaining seamless integration with Model Context Protocol (MCP) for AI agent collaboration. Built with TypeScript and featuring encrypted local storage, Astrolabe enables productive task management workflows both independently and with AI assistance.

## Features

- **Local-First Architecture**: All data is stored locally with optional sync capabilities
- **MCP Integration**: Native support for Model Context Protocol for AI agent interaction
- **Encrypted Storage**: SQLCipher-based encryption for sensitive task data
- **Real-time Sync**: CRDT-based synchronization via ElectricSQL
- **Type-Safe**: Built with TypeScript and Zod schema validation
- **Offline-Ready**: Full functionality without internet connectivity

## Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended) or npm/yarn

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd astrolabe

# Install dependencies
pnpm install

# Build the project
pnpm build
```

## Development

```bash
# Start development server with hot reload
pnpm dev

# Run type checking
pnpm type-check

# Lint and format code
pnpm verify

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Project Structure

```
astrolabe/
├── packages/           # Monorepo packages
│   ├── core/          # Core application library (@astrolabe/core)
│   │   ├── src/       # Source code
│   │   ├── test/      # Core tests
│   │   └── dist/      # Compiled output
│   ├── cli/           # Command-line interface
│   │   ├── source/    # CLI source code
│   │   └── dist/      # Compiled CLI
│   └── mcp/           # Model Context Protocol server
│       ├── src/       # MCP server source
│       └── dist/      # Compiled server
├── test/              # Integration tests
├── docs/              # Documentation
│   ├── api/          # API documentation
│   └── guides/       # User guides
├── config/           # Configuration files
├── examples/         # Example usage and demos
├── scripts/          # Build and utility scripts
├── tasks/            # Task management files
└── .cursor/          # Cursor AI configuration
    └── rules/        # AI agent guidance rules
```

## Core Dependencies

- **[Zod](https://zod.dev/)**: Runtime type validation and schema inference
- **[ElectricSQL](https://electric-sql.com/)**: Local-first sync with CRDT support
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)**: Fast SQLite3 with encryption
- **[MCP SDK](https://modelcontextprotocol.io/)**: Model Context Protocol implementation

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Compile TypeScript to JavaScript |
| `pnpm dev` | Start development server with hot reload |
| `pnpm type-check` | Run TypeScript type checking |
| `pnpm lint` | Check code with Biome linter |
| `pnpm lint:fix` | Fix linting issues automatically |
| `pnpm format` | Check code formatting |
| `pnpm format:fix` | Format code automatically |
| `pnpm verify` | Run full verification (type-check, lint, format, build, test) |
| `pnpm test` | Run tests once |
| `pnpm test:watch` | Run tests in watch mode |

## Documentation

- [Design Document](./docs/design.md) - Technical design and architecture
- [API Documentation](./docs/api/) - API reference (coming soon)
- [User Guides](./docs/guides/) - Usage guides (coming soon)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run the verification suite (`pnpm verify`)
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. See [test/README.md](./test/README.md) for detailed testing guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Roadmap

- [ ] Core task management engine
- [ ] SQLite schema and migrations
- [ ] MCP server implementation
- [ ] ElectricSQL integration
- [ ] CLI interface
- [ ] Web interface
- [ ] Mobile app support

## Status

🚧 **Early Development** - This project is in active development. APIs and features are subject to change.

Current milestone: **M0 - Project Foundation** (v0.1.0) 