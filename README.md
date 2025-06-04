# Astrotask

**Task manager built for humans _and_ AI agents**

Offline‑ready · MCP‑compatible · Fully‑type‑safe · Extensible

[![npm (scoped)](https://img.shields.io/npm/v/@astrotask/cli?label=npm%20%40astrotask%2Fcli)](https://www.npmjs.com/package/@astrotask/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/marktoda/astrotask/actions/workflows/ci.yml/badge.svg)](https://github.com/marktoda/astrotask/actions)

---

## Why Astrotask?

Astrotask is more than a to‑do list—it's a **shared brain** where developers and AI agents collaborate in real time.

- **One database file, limitless context** – Every surface (CLI, TUI, SDK, MCP) reads & writes the _same_ local database, so long‑running agents never lose the bigger picture.
- **Capture anywhere, even offline** – Jot ideas down on a plane; the file lives on your disk and syncs later
- **Automatic project decomposition** – Built‑in generators break PRDs into nested tasks your agent can tackle autonomously.
- **First‑class dependency graph** – Visualise blockers and let agents sequence their own work without stepping on each other.
- **Multi‑agent friendly** – Run several specialised agents (or agent + developer) against the same store; SQLite WAL keeps writes safe.
- **Human‑optimised CLI & dashboard** – Developers can triage, reprioritise, or inject tasks while agents churn through the backlog.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [CLI](#cli)
  - [Programmatic](#programmatic)
  - [AI / MCP](#ai--mcp)
- [Adding Tasks](#adding-tasks)
- [Operating & Running Tasks](#operating--running-tasks)
- [Screenshots](#screenshots)
- [How It Works](#how-it-works)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

---

## Installation

```bash
# Until v1.0 install the latest pre‑release tag
npm install -g @astrotask/cli@next      # or: pnpm / yarn
```

Upgrading is just as easy:

```bash
npm update -g @astrotask/cli
```

> **Prerequisites**  Node 18+, SQLite 3.40+, and `pnpm` if you plan to work on the monorepo.

After installation you'll have the `astro` command in your PATH.

---

## Quick Start

### CLI

```bash
# 1. Create a workspace
mkdir my-project && cd $_

# 2. Initialise Astrotask (creates ./data/astrotask.db and starter rules)
astro init

# 3. Add a task and view it
astro task add "Ship public launch"
astro task tree

# 4. Open the live dashboard (press <c> to toggle completed tasks)
astro dashboard
```

### Programmatic

```ts
import { createAstrotask } from "@astrotask/core";

const astrotask = await createAstrotask({
  databaseUrl: "./data/astrotask.db",
});

await astrotask.tasks.addTask({
  title: "Implement OAuth",
  description: "Add Google login",
});
```

### AI / MCP

```json
{
  "mcpServers": {
    "astrotask-task": {
      "command": "npx",
      "args": ["@astrotask/mcp"],
      "env": {
        "DATABASE_PATH": "/home/toda/dev/astrotask/data/astrotask.db"
      }
    }
  }
}
```

OR

```bash
astro init
```

Configure your agent (Cursor, ChatGPT plug‑in, …) with the endpoint and start calling tools such as:

```json
{
  "name": "getNextTask",
  "arguments": { "priority": "high" }
}
```

---

## Adding Tasks

### Manual (CLI)

```bash
# Simple capture
astro task add "Write onboarding docs"

# Add under a parent and set priority
astro task add "Design hero section" --parent <parentId> --priority high
```

### Generate from a PRD

Break a spec into structured work:

```bash
astro task generate --file ./specs/authentication.prd.md
# Use --dry to preview without touching your DB
```

### Ask an Agent (MCP)

```json
{
  "name": "addTasks",
  "arguments": {
    "tasks": [
      {
        "title": "Refactor caching layer",
        "description": "Move from LRU to ARC",
        "priority": "medium"
      }
    ]
  }
}
```

---

## Operating & Running Tasks

| Action                            | Command                                |
| --------------------------------- | -------------------------------------- |
| See what to do next               | `astro task next`                      |
| Full list (pending & in‑progress) | `astro task list`                      |
| Mark done                         | `astro task done <id>`                 |
| Update fields                     | `astro task update <id> --status done` |
| Visualise tree                    | `astro task tree [--root <id>]`        |
| Validate dependencies             | `astro dependency validate`            |
| Interactive dashboard             | `astro dashboard`                      |

All commands accept `--help`.

---

## Screenshots

![Astrotask Dashboard screenshot](./assets/dashboard.png)

---

## How It Works

1. `@astrotask/core` provides a type‑safe service layer over the local database.
2. The CLI/TUI (`astro`) talks to the SDK directly.
3. The MCP server exposes the same operations to AI tools via JSON‑RPC.
4. SQLite WAL mode gives safe concurrent access (dashboard + agent + script).

**Design principles**

- **Local‑first** – Data should be useful without a network.
- **Single source of truth** – CLI, SDK & MCP all share the same database file.
- **Explicit context** – Agents receive structured bundles, never raw SQL.
- **Type‑safe all the way** – Zod runtime validation mirrors TypeScript types.

---

## Contributing

We ♥ new contributors! See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) for philosophy & guidelines.

- Code must pass `pnpm verify` (`build ➜ type-check ➜ lint ➜ test`).
- Keep rules/docs in sync with code changes.
- Small PRs > big bang.

---

## Roadmap

| Milestone | Focus                                       |
| --------- | ------------------------------------------- |
| **v0.2**  | Polished CLI & MCP, dependency UX           |
| **v0.3**  | ElectricSQL synchronization + web dashboard |
| **v1.0**  | Mobile apps, plug‑in ecosystem              |

---

## License

Astrotask is released under the [MIT License](LICENSE).
