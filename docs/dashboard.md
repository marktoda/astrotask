# Astrolabe Terminal UI – Comprehensive Design Document

**Version**: 0.2 | **Date**: 2025‑05‑28 | **Author**: ChatGPT (revised to use Ink + Pastel)

---

## 1 Purpose & Scope

Astrolabe is a **local‑first** task‑management tool for AI‑augmented teams. This document specifies the architecture and user‑experience of the **terminal UI (TUI)** built with **Ink (React for CLIs) and Pastel**. The TUI must enable engineers (and agents) to:

- browse open projects and their nested subtasks
- view real‑time percent‑complete at every node of the task tree
- add or delete tasks at any depth
- define or remove cross‑task **dependencies** ("blocked‑by" edges)
- operate entirely offline, with eventual sync handled elsewhere

Non‑goals: full graphical Gantt charts, Kanban, or mobile UX; those may be addressed in later milestones.

---

## 2 Tech Stack

| Layer         | Choice                                     | Rationale                                                     |
| ------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Runtime       | Node ≥ 20                                  | ES2022 features; good Ink support                             |
| Language      | TypeScript (strict)                        | Type‑safety across UI & domain logic                          |
| CLI Framework | **Pastel**                                 | Minimal boilerplate for command bootstrap, routing, packaging |
| TUI render    | **Ink** (+ ink‑gradient, ink‑select‑input) | React mental‑model; declarative; fast diff renderer           |
| Styling       | chalk & ink‑gradient                       | Readable colour abstractions                                  |
| State         | **Zustand** (React store)                  | Lightweight, hooks‑friendly                                   |
| Persistence   | ElectricSQL client → PGlite / SQLite       | Local‑first, CRDT‑backed sync                                 |
| Tests         | Vitest + **ink‑testing‑library**           | Snapshot, hook testing                                        |

---

## 3 Domain Model ⇄ UI Mapping

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

- **Task Tree** ⇒ vertical outline (main pane) rendered via recursive Ink component.
- **Dependency Graph** ⇒ on‑demand overlay component (ascii‑dag + chalk colours).
- **Percent Complete** for a node = `(doneLeaves / totalLeaves) × 100`, leaves exclude cancelled.

Store keeps two indices:

- `childrenByParent: Map<id, id[]>`
- `depsByTask: Map<id, id[]>`

---

## 4 UI Layout (Concept)

```
┌──────────── Project List ─────────────┐
│ ▸ Project Alpha (75 %)               │
│   Project Beta (20 %)                │
└───────────────────────────────────────┘
┌───────────── Task Tree ───────────────┐
│ • [ ] Build CLI parser                │
│   • [x] Choose Ink lib                │
│   • [ ] Draft keybindings             │
│ • [ ] Write unit tests                │
└───────────────────────────────────────┘
┌──────── Detail / Dependency ──────────┐
│ Task: Draft keybindings               │
│ Status: in‑progress                   │
│ Blocked by: #123 Write spec           │
└───────────────────────────────────────┘
```

Ink uses Flex‑box‑like sizing; we compose with `<Box flexDirection="column">` wrappers.

---

## 5 Keybindings (Default)

| Key   | Action                         |
| ----- | ------------------------------ |
| ↑ / k | Move cursor up                 |
| ↓ / j | Move cursor down               |
| ← / h | Collapse node                  |
| → / l | Expand node                    |
| ⏎     | Toggle checkbox / mark done    |
| a     | **Add sibling** task below     |
| A     | **Add child** task             |
| D     | Delete selected task (confirm) |
| %     | Recalculate progress (auto)    |
| b     | Add dependency (prompt)        |
| B     | Remove dependency              |
| :     | Open command palette           |
| ?     | Help overlay                   |
| q     | Quit (double‑tap safety)       |

Ink captures raw keystrokes via `useInput`.

---

## 6 Command Palette Grammar

Powered by Pastel’s command routing but exposed inside Ink modal. Examples:

- `add "Build auth" under 42`
- `delete 108`
- `dep 108 -> 42`
- `move 55 to 42`

Parser built with `commander` or `zod‑cli`.

---

## 7 Progress Calculation & Streaming Updates

1. Store maintains set of parents dirty when a leaf status changes.
2. Debounced worker recalculates subtree percentages (post‑order DFS).
3. React state slice triggers Ink diff‑render; only affected nodes update.
4. ElectricSQL sync layer pushes merges; store hydrates; UI re‑renders.

---

## 8 Dependency Visualisation

1. **Inline Icons** – glyph (⏳) next to tasks that are blocked; tooltip via Ink Tooltip.
2. **Overlay Graph** – press `v` → component renders ascii‑dag with chalk colours; arrows show edges; blocked path in red.

Edge operations via keyboard or palette commands.

---

## 9 Architecture & Modules

```
src/
  cli.ts            // Pastel entrypoint – registers default command
  app.tsx           // <App/> root component (Ink)
  ui/
    components/
      ProjectList.tsx
      TaskTree.tsx
      DetailPane.tsx
      StatusBar.tsx
      CommandPalette.tsx
  store/
    index.ts        // Zustand store + selectors
    calcProgress.ts
  domain/
    models.ts       // Task interfaces
    repo.ts         // ElectricSQL CRUD adapter
  services/
    sync.ts         // offline ↔ cloud replication
    keymap.ts       // load & dispatch keymaps
  tests/
```

Pastel’s `run()` auto‑parses CLI flags then calls Ink’s `render(<App />)`.

---

## 10 Performance Notes

- Ink’s reconciler is efficient but very deep trees (>10 k nodes) still need virtualisation – render only visible slice based on scroll offset.
- Use `fast‑diff` for ascii‑dag updates to avoid realloc.
- Batch CRDT merge events – throttle to 30 FPS for smooth UI.

---

## 11 Error Handling UX

| Scenario             | UX Response                                  |
| -------------------- | -------------------------------------------- |
| DB write fails       | Status bar flashes red; hint to retry (_r_)  |
| Duplicate dependency | Inline warning; keep focus                   |
| Invalid command      | Palette shows error message, preserves input |
| Unsaved exit         | Prompt if pending local ops > 0              |

Errors propagate as discriminated union `AppError`; `<ErrorBoundary>` component maps variant → chalk styling.

---

## 12 Testing Strategy

- **Unit** – store reducers, progress calc, command parser.
- **Integration** – render components with `ink‑testing‑library`; assert snapshot.
- **E2E** – spawn child process via `execa`, pipe pseudo‑tty keystrokes, diff stdout.

CI runs on Node 20 & 22.

---

## 13 Extensibility & Future Work

| Idea                   | Notes                                                         |
| ---------------------- | ------------------------------------------------------------- |
| Plugin API             | Expose React context hooks: `useTaskAdded`, `registerOverlay` |
| Theming                | Ink‑gradient + Pastel flag `--theme dark`                     |
| Notifications          | Desktop (node‑notifier) when blockers clear                   |
| Git‑style patch export | `astrolabe format‑patch` for reviews                          |

---

## 14 Milestones & Timeline (Indicative)

| Week | Deliverable                                |
| ---- | ------------------------------------------ |
| 1    | Spike Ink layout, tree rendering           |
| 2    | Store + CRUD wired to ElectricSQL local db |
| 3    | Progress calc + status bar                 |
| 4    | Dependency commands & overlay              |
| 5    | Command palette via Pastel routing         |
| 6    | Beta release, dog‑food inside team         |

---

## 15 Open Questions

1. How should task ordering be stored? (manual index vs timestamp sort)
2. Do we require encrypted local db? (agent privacy)
3. Should dependency edges allow cycles with warning or hard‑prevent?
4. Accessibility: does Ink need screen‑reader accommodations? (Ink currently passes through raw output – may not be screen‑reader friendly.)

---

## 16 Glossary

- **Task Tree** – hierarchical representation of work items.
- **Dependency Graph** – DAG indicating blocking relationships.
- **TUI** – Terminal User Interface built with Ink.
- **Pastel** – Minimal CLI framework for Node.
- **CRDT** – Conflict‑free Replicated Data Type.

---

> *“Good software, like wine, takes time.”* — Joel Spolsky
