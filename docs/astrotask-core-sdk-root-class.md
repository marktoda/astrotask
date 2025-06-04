# Design Document  
Astrotask Core SDK – `Astrotask` Root Class Entry-point

| Field            | Value                                  |
| ---------------- | -------------------------------------- |
| Author           | Core Platform Team                     |
| Created          | 2025-06-03                             |
| Target Version   | `@astrotask/core` v0.2.0               |
| Status           | Proposal                               |
| Reviewers        | —                                      |

---

## 1  Problem Statement
`@astrotask/core` exposes a large surface area via barrel exports.  
Integrators must:

1. pick & configure a database adapter,
2. run migrations,
3. construct every service (task, dependency, generators, etc.),
4. wire logging and graceful shutdown,

before they can issue a single `createTask` call.  
This friction discourages adoption, especially for quick experiments, CLI utilities, or low-code tools.

---

## 2  Goals
1. **Single-line bootstrap**: `const sdk = await Astrotask.create(opts);`.
2. **Automatic database handling** (URL parsing, migrations, connection pooling).
3. **Lazy, typed access** to core services (tasks, dependencies, generators, analysis, expansion).
4. **Lifecycle hooks**: `init`, `flushChanges`, `close`.
5. **Tree-shakable / side-effect-free** when unused.
6. **Backward compatibility** for existing direct imports.

### Non-Goals
* Replace low-level service APIs.
* Provide network or RPC endpoints (belongs in a higher-level package).
* Rewrite internal business logic.

---

## 3  High-Level Architecture

```
            ┌──────────────────┐
            │  Astrotask Root  │
            └──────────────────┘
                ▲     ▲     ▲
                │     │     │
   ┌────────────┘     │     └────────────┐
   │                  │                  │
TaskService    DependencyService   GeneratorRegistry
(composes)      (composes)         (PRD, Expansion…)
```

Internally, the root object owns:

* `IDatabaseAdapter` (selected via `parseDbUrl` → PostgreSQL, SQLite, PGLite).  
* `ModuleLogger` configured with global `logLevel`.  
* Lazy-instantiated **services**; each receives `{ db, logger }`.

---

## 4  Public API Sketch

```ts
import { Astrotask } from '@astrotask/core';

const sdk = await Astrotask.create({
  db: process.env.DATABASE_URL ?? './data/app.sqlite',
  logLevel: 'info',
  workspaceRoot: process.cwd(),
});

const task = await sdk.tasks.create({ title: 'Hello' });
await sdk.dependencies.add({ parent: task.id, child: ... });

await sdk.flushChanges(); // persist Tracking* buffers
await sdk.close();        // graceful shutdown
```

### 4.1 `AstrotaskOptions`

```ts
type AstrotaskOptions = {
  db: string | DbUrl;                    // required
  logLevel?: 'fatal'|'error'|'warn'|'info'|'debug'|'trace';
  workspaceRoot?: string;
  generators?: Partial<GeneratorRegistry>;
  experimental?: { streamingFlush?: boolean };
  skipMigrations?: boolean;
};
```

### 4.2 Root Object Interface

| Method / Property          | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `static create(opts)`      | Async constructor; runs `init()` internally.         |
| `init()`                   | Idempotent heavy-weight bootstrap (migrations).      |
| `tasks`                    | Lazy getter → `TaskService`.                         |
| `dependencies`             | Lazy getter → `DependencyService`.                   |
| `generators`               | Object with PRD, expansion, etc.                     |
| `complexity`               | `ComplexityAnalyzer`.                                |
| `expansion`                | `TaskExpansionService`.                              |
| `flushChanges()`           | Flushes Tracking* pending operations.                |
| `rawDb`                    | Escape hatch exposing the adapter.                   |
| `close()`                  | Flush + dispose DB pool + emit `beforeClose/close`.  |
| `on(event, fn)`            | NodeJS style event emitter.                          |

---

## 5  Key Design Decisions

| Area              | Decision & Rationale                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| **Adapter Layer** | Introduce `IDatabaseAdapter` interface; keeps services free of driver implementation details. |
| **Migrations**    | Store SQL files per adapter (`src/database/migrations/postgres/*`); executed via `migrateIfNeeded()` during `init()`. |
| **Lazy Services** | Delay instantiation until first access ⇒ smaller startup footprint & tree-shaking friendliness. |
| **Error Model**   | All SDK-thrown errors extend `AstrotaskError` `{ code, message, cause }`. |
| **Observability** | Each `Astrotask` owns a `ModuleLogger`; users choose `logLevel`. Additionally exposes `events` emitter. |
| **Browser Support** | Use conditional exports: Node build ships pg / better-sqlite3; Browser build relies on `pglite` + WASM. |

---

## 6  Backward Compatibility

* Existing code importing `TaskService` et al. directly will continue to work.  
* The barrel file `src/index.ts` re-exports `Astrotask`.  
* Version bump **minor** (`0.2.x`) because API is additive.

---

## 7  Implementation Plan

| Step | Task |
| ---- | ---- |
| 1 | Create `src/Astrotask.ts` with interface described above. |
| 2 | Extract current DB setup into `database/adapters/{postgres,sqlite,pglite}.ts`. |
| 3 | Add migration runner `database/migrate.ts`. |
| 4 | Update services to accept `IDatabaseAdapter` instead of concrete drivers. |
| 5 | Barrel-export `Astrotask` from `src/index.ts`. |
| 6 | Unit tests: URL parsing integration, lazy getters, migrations run once, disposal. |
| 7 | Docs: `docs/sdk/quickstart.md`, migration guide. |
| 8 | Publish pre-release `0.2.0-alpha`. |

---

## 8  Testing Strategy

1. **Unit Tests** (Vitest)  
   * `Astrotask.create` w/ each adapter.  
   * Lazy service instantiation counts.  
   * `flushChanges` drains buffers; verify in DB.  
2. **Integration**  
   * CLI smoke test: create ≻ expand ≻ close on SQLite.  
   * Browser E2E using Playwright + pglite-idb.  
3. **Contract Tests**  
   * Ensure `TaskService` behaviour is unchanged behind the facade.

---

## 9  Risk Assessment & Mitigations

| Risk                                    | Mitigation |
| --------------------------------------- | ---------- |
| Divergent migrations across adapters    | One canonical SQL generator; nightly CI verifies parity. |
| Increased bundle size in browser builds | Conditional exports + dynamic `import()` of adapter. |
| Abstraction leakage from adapters       | Keep adapter interface minimal (query, transaction, dispose). |
| Breaking existing user code via side-effects | New code path is opt-in; all previous APIs untouched. |

---

## 10  Open Questions

* Should we expose an **async iterator** for streaming `flushChanges`?  
* Provide a **plugin system** (`sdk.use(plugin)`) in the same release or future one?  
* Should the root class be a **singleton** (enforced) or allow multiple instances per process? (Current design allows many but warns if DB URLs collide.)

---

## 11  Timeline (tentative)

| Week | Milestone |
| ---- | --------- |
| 0-1  | Adapter abstraction & migration runner |
| 2    | `Astrotask` skeleton + lazy services |
| 3    | Testing & docs |
| 4    | Alpha release & feedback |
| 5    | v0.2.0 stable |

---

## 12  Conclusion
By introducing a dedicated `Astrotask` root class we significantly lower the barrier to entry, present a coherent SDK story, and lay the groundwork for future extensibility (plugins, remote sync). The design remains backward-compatible, incremental, and focused on developer ergonomics—key to wider adoption of the Astrotask platform. 