# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Astrotask is a local-first, MCP-compatible task management platform for humans and AI agents. It's built as a TypeScript monorepo using pnpm workspaces with strict type safety and offline-first principles.

## Architecture

- **@astrotask/core** - Core library with task management, database abstraction, and services
- **@astrotask/cli** - Command-line interface (`astro` command) 
- **@astrotask/mcp** - Model Context Protocol server for AI agent integration
- **Local SQLite database** - Primary data store with WAL mode for concurrent access
- **Zod schemas** - Runtime validation for all data models
- **Biome** - Code formatting and linting

## Common Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Type checking
pnpm type-check

# Lint and format (auto-fix)
pnpm lint:fix
pnpm format:fix

# Full verification (run before commits)
pnpm verify

# CLI development
pnpm cli <command>

# Dashboard (TUI interface)
pnpm dashboard

# Run single test file
cd packages/core && pnpm test basic.test.ts
```

## Code Quality Standards

This project enforces strict code quality with Biome:

- **No `any` types** - Use explicit TypeScript types
- **No `console.log`** - Use proper logging utilities
- **Zod schemas** - All runtime data must flow through Zod validation
- **2 spaces, single quotes, semicolons** - Follow Biome configuration
- **100 character line width**

Always run `pnpm verify` before committing. This runs build, lint, format, type-check, and tests.

## Key Conventions

1. **Local-First**: Prefer SQLite operations over cloud dependencies
2. **Type Safety**: All data models use Zod schemas with TypeScript inference
3. **Monorepo Structure**: Use `pnpm -r` commands to run across all packages
4. **ES Modules**: Native ESM with Node16 module resolution
5. **Strict TypeScript**: Enhanced strictness with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

## Database

- Primary database: SQLite at `./data/astrotask.db`
- Database adapters support SQLite, PostgreSQL, and PGlite
- All database operations go through the store layer with proper error handling
- Migrations are managed via Drizzle ORM

## Testing

- Vitest for unit testing
- Test utilities in `packages/core/test/testUtils.ts`
- Database tests use temporary SQLite instances
- Run `pnpm test:clean` to cleanup test data

## Important File Locations

- Main exports: `packages/core/src/index.ts`
- Database schema: `packages/core/src/database/schema.ts`
- Task service: `packages/core/src/services/TaskService.ts`
- CLI commands: `packages/cli/source/commands/`
- MCP handlers: `packages/mcp/src/handlers/`

## Development Workflow

1. Make changes following TypeScript/Biome conventions
2. Run `pnpm type-check` to verify types
3. Run `pnpm lint:fix && pnpm format:fix` to fix code style
4. Run `pnpm test` to verify functionality
5. Run `pnpm verify` before committing
6. Never commit if verification fails