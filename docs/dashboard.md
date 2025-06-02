# Astrolabe Terminal UI – Comprehensive Design Document

**Version**: 0.1  |  **Date**: 2025‑05‑28  |  **Author**: ChatGPT (draft – awaiting team review)

---

## 1  Purpose & Scope

Astrolabe is a _local‑first_ task‑management tool for AI‑augmented teams. This document specifies the architecture and user‑experience of the **terminal UI (TUI)** built with **TypeScript + blessed**. The TUI must enable engineers (and agents) to:

- browse open projects and their nested subtasks
- view real‑time percent‑complete at every node of the task tree
- add or delete tasks at any depth
- define or remove cross‑task _dependencies_ (“blocked‑by” edges)
- operate entirely offline, with eventual sync handled elsewhere

Non‑goals: full graphical Gantt charts, Kanban, or mobile UX; those may be addressed in later milestones.

---

## 2  Tech  Stack

| Layer            | Choice                                 | Rationale                                     |
| ---------------- | -------------------------------------- | --------------------------------------------- |
| Runtime          | Node ≥ 20                              | ES2022 features & prompt blessed support      |
| Language         | TypeScript (strict)                    | Type‑safety across UI & domain logic          |
| TUI lib          | **blessed** + @types/blessed           | Mature, composable widgets, good key handling |
| Rendering extras | blessed‑contrib (sparklines), chalk    | Lightweight visuals                           |
| State            | **Zustand** or custom Redux‑lite store | Reactive updates without Magick               |
| Persistence      | ElectricSQL client → PGlite / SQLite   | Local‑first, CRDT‑backed sync                 |
| Tests            | Vitest + blessing (mock terminal)      | Fast, footgun‑free                            |

---

## 3  Domain Model ⇄ UI Mapping

```ts
interface Task {
  id: string; // UUID‑v4
  title: string;
  status: "pending" | "in‑progress" | "done" | "cancelled";
  parentId?: string; // undefined if project‑root
  dependencyIds: string[]; // other Task.ids
  createdAt: Date;
  updatedAt: Date;
}
```

- **Task Tree** ⇒ vertical outline view (main pane). Root level = project.
- **Dependency Graph** (DAG) ⇒ on‑demand overlay / detail pane.
- **Percent Complete** for a node = `(doneLeaves / totalLeaves) × 100` where leaves exclude cancelled.

The store keeps two indices:

- `childrenByParent: Map<id, id[]>`
- `depsByTask: Map<id, id[]>`

These support O(1) lookup for rendering.

---

## 4  UI  Layout

```
┌──────────────── Project Sidebar ───────────────┐┐
│ ▸ Project Alpha (75%)                         ││
│   Project Beta (20%)                          ││
│                                                ││
└───────────────────────────────────────────────┘│
│┌───────────── Task Tree ─────────────────────┐ │
││ • [ ] Build CLI parser                      │ │
││   • [x] Choose blessed lib                  │ │
││   • [ ] Draft keybindings                   │ │
││ • [ ] Write unit tests                      │ │
│└──────────────────────────────────────────────┘ │
│┌────────── Details / Dependency Pane ────────┐ │
││ Task: Draft keybindings                     │ │
││ Status: in‑progress                         │ │
││ Blocked by: #123 Write spec                 │ │
││ Due: —                                      │ │
│└──────────────────────────────────────────────┘ │
└──────────────────── Status Bar ────────────────┘
```

- **Sidebar** – collapsible project list (⇧⇩ to select, ↵ to focus).
- **Task Tree Pane** – hierarchical view with check‑boxes; left/right arrow to fold/unfold; _g_/_G_ top/bottom.
- **Detail Pane** – toggled with _d_. Shows description, deps, metadata.
- **Status Bar** – mode indicator, hints, last message.
- **Command Palette** – modal overlay opened with `:` (vim‑style) for power commands.

---

## 5  Keybindings (Default)

| Key   | Action                                 |
| ----- | -------------------------------------- |
| ↑ / k | Move cursor up                         |
| ↓ / j | Move cursor down                       |
| ← / h | Collapse node                          |
| → / l | Expand node                            |
| ⏎     | Toggle checkbox / mark done            |
| a     | _Add_ sibling task below               |
| A     | Add _child_ task                       |
| D     | Delete selected task (confirm)         |
| d     | Toggle dependency tree view            |
| %     | Recalculate progress (auto on tick)    |
| b     | Add dependency (prompts for target id) |
| B     | Remove dependency                      |
| :     | Open command palette                   |
| ?     | Show help overlay                      |
| q     | Quit (double‑tap safety)               |

All keys are configurable via a JSON config (\~/.config/astrotask/keys.json).

---

## 6  Command Palette Grammar

Example commands (autocompletion via fuzzy):

- `add "Build auth" under 42` – inserts child under id 42.
- `delete 108` – removes task.
- `dep 108 -> 42` – declare dependency.
- `move 55 to 42` – re‑parent.
- `import linear.csv` – bulk import (future).

Internally parsed via `commander` + custom DSL.

---

## 7  Progress Calculation & Streaming Updates

1. Store maintains dirty set of parents when a leaf status changes.
2. Debounced worker recalculates subtree completion % using post‑order DFS.
3. UI listens to `progressUpdated` events and re‑renders minimal diff – blessed performs diff rendering natively.
4. Sync writes (CRDT merges) fire separate events; UI reconciles via same store.

---

## 8  Dependency Visualization

Two modes:

1. **Inline Icons** – a glyph (⎋) next to tasks that are blocked; tooltip lists blockers.
2. **Overlay Graph** – press _v_ to open a zoomed graph (rendered with ascii‑dag or blessed‑contrib graph). Arrows show edges, colouring blocked paths in red.

Edge operations:

- _b_ prompts for task id (or fuzzy search) then adds edge.
- Selecting a blocker in graph view jumps cursor to that task.

---

## 9  Architecture & Modules

```
src/
  index.ts         // CLI bootstrap
  ui/
    layout.ts      // bless layout factory
    components/
      projectList.ts
      taskTree.ts
      detailPane.ts
      statusBar.ts
      commandPalette.ts
  store/
    index.ts       // Zustand store + selectors
    calcProgress.ts
  domain/
    models.ts      // Task interfaces
    repo.ts        // ElectricSQL CRUD adapter
  services/
    sync.ts        // offline ↔ cloud replication
    keymap.ts      // load & dispatch keymaps
  tests/
```

_Decoupling principle_: UI components **never** make DB calls – they dispatch actions to the store. The repo triggers `hydrate` on app start and merges updates from the sync layer.

---

## 10  Performance Notes

- Blessed diff‑renders but large trees (>10 k tasks) can choke. Virtualise by rendering only visible slice.
- Use `nanobus` event emitter (200 B) for low‑overhead events.
- Batch CRDT merges – throttle to 30 FPS for smooth UI.

---

## 11  Error Handling UX

| Scenario             | UX Response                                           |
| -------------------- | ----------------------------------------------------- |
| DB write fails       | Status bar flashes red with reason; offer retry (_r_) |
| Duplicate dependency | Modal warning; keep both sides intact                 |
| Invalid command      | Palette highlights error & keeps input                |
| Unsaved exits        | Prompt if pending local ops (> 0)                     |

Errors bubble via `AppError` discriminated unions; renderer maps variant → message + severity.

---

## 12  Testing Strategy

- **Unit** – store reducers, progress calc, command parser.
- **Integration** – simulate key streams with `blessed.testing` harness; assert screen snapshots (ansi‑diff).
- **E2E** – spawn child process, feed pseudo‑tty keystrokes, diff stdout against golden snapshots.

CI runs on Node 20 & 22 to catch regressions.

---

## 13  Extensibility & Future Work

| Idea                   | Notes                                         |
| ---------------------- | --------------------------------------------- |
| Plugin API             | Publish hooks: `onTaskAdded`, `renderOverlay` |
| Theming                | Support solarized/dark via chalk theme tokens |
| Notifications          | Desktop popup when blocker unblocks           |
| Git‑style patch export | `astrotask format‑patch` for reviews          |

---

## 14  Milestones & Timeline (Indicative)

| Week | Deliverable                                |
| ---- | ------------------------------------------ |
| 1    | Spike blessed layout, prove tree rendering |
| 2    | Store + CRUD wired to ElectricSQL local db |
| 3    | Progress calc + status bar                 |
| 4    | Dependency commands & overlay              |
| 5    | Command palette, configurable keys         |
| 6    | Beta release, dog‑food inside team         |

---

## 15  Open Questions

1. How should task ordering be stored? (manual index vs timestamp sort)
2. Do we require encrypted local db? (agent privacy)
3. Should dependency edges allow cycles with warning or hard‑prevent?
4. Accessibility: is screen‑reader support a requirement?

---

## 16  Glossary

- **Task Tree** – hierarchical representation of work items.
- **Dependency Graph** – DAG indicating blocking relationships.
- **TUI** – Terminal User Interface.
- **CRDT** – Conflict‑free Replicated Data Type.

---

> _“Simplicity is prerequisite for reliability.”_ ― Edsger Dijkstra
