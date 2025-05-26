**Astrolabe – Design Document (v 0.1)**
*A local-first, MCP-compatible task-navigation platform for humans + AI agents*

> **Why “Astrolabe”?**
> An astrolabe let medieval sailors locate themselves from the stars.
> Likewise, this tool helps developers & agents “plot their position” in a project—offline, precisely, and with just one reading.

---

## 1 Purpose & Scope

Astrolabe replaces server-bound planners (e.g. TaskMaster) with a **local-first, type-safe workspace**:

* **ElectricSQL** – project-local **SQLite** replica that syncs to a shared Postgres hub when online.
* **Zod** – runtime validation + compile-time TypeScript inference.
* **MCP façade** – one round-trip gives any LLM agent (or you) every scrap of context needed to act.

It must work for solo devs at 30 000 ft with no Wi-Fi and for small teams that sync occasionally.

---

## 2 Goals & Non-Goals

| ID | Goal                                             |
| -- | ------------------------------------------------ |
| G1 | 100 % project workflow offline.                  |
| G2 | One MCP call returns full task context.          |
| G3 | Friendly CLI & VS Code sidebar—no DB spelunking. |
| G4 | End-to-end type safety.                          |
| G5 | Optional Linear/GitHub mirroring.                |

*Non-goals:* multi-tenant SaaS hosting, enterprise SSO, full Kanban UI.

---

## 3 Architecture Overview

```mermaid
graph TD
  subgraph Local
    CLI["CLI / VS Code<br>(astrolabe …)"]
    MCP[[MCP Server]]
    Resolver[Context Resolver]
    SQLite[(SQLite • ElectricSQL)]
  end
  Postgres[(Shared Postgres)]
  Linear[Linear Cloud]
  Agent[LLM Agent]

  CLI -- IPC --> MCP
  Agent -- MCP API --> MCP
  MCP --> SQLite
  Resolver --> SQLite
  SQLite <..> Postgres :::sync
  MCP -.optional.-> Linear
```

---

## 4 Component Detail

| Layer                | Key Duties                                                          |
| -------------------- | ------------------------------------------------------------------- |
| **Domain**           | Zod schemas `Task`, `Epic`, `Project`, `ContextSlice`.              |
| **SQLite**           | Single file `astrolabe.db` (encrypted with SQLCipher).              |
| **ElectricSQL**      | CRDT merge & offline-first sync.                                    |
| **MCP Server**       | Named functions (see §6) via JSON-RPC over HTTP/WS.                 |
| **Context Resolver** | Embeddings store (pgvector or sqlite-vector); thin-slice summaries. |
| **CLI / Extension**  | Commands, panels, dependency graphs.                                |
| **Linear Adapter**   | Two-way issue sync.                                                 |

---

## 5 Data Model Snapshot

```ts
export const Task = z.object({
  id: uuid(),
  parentId: uuid().nullable(),
  title: z.string().min(3),
  status: z.enum(['todo','doing','blocked','done']),
  prd: z.string().optional(),
  contextDigest: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});
```

---

## 6 MCP Function Catalogue

| Name             | Signature                      | Purpose                               |                  |
| ---------------- | ------------------------------ | ------------------------------------- | ---------------- |
| `listTasks`      | `(filter?, opts?) → Task[]`    | Fast, cursor-based listing.           |                  |
| `createTask`     | `(input: NewTask) → Task`      | Validated insert.                     |                  |
| `updateTask`     | `(id, patch) → Task`           | Partial update.                       |                  |
| `deleteTask`     | `(id) → void`                  | Soft delete.                          |                  |
| `completeTask`   | `(id) → Task`                  | Mark **done** & digest.               |                  |
| `getTaskContext` | `(id, depth?) → ContextBundle` | Task + ancestry + related + git diff. |                  |
| `syncLinear`     | \`(direction:'push'            | 'pull', labels?) → SyncReport\`       | Optional mirror. |
| `importPrd`      | `(filePath) → Epic[]`          | Markdown → tasks.                     |                  |
| `exportPrd`      | `(epicIds) → Markdown`         | Tasks → Markdown PRD.                 |                  |
| `renderGraph`    | \`(fmt:'mermaid'               | 'json') → string\`                    | Dependency DAG.  |

The MCP manifest advertises these so agents can discover them.

---

## 7 Idiomatic CLI Layout

```
astrolabe ─┬ task     list|add|update|rm|done
           ├ context  show <taskId>
           ├ prd      import <file> | export <epicIds>
           ├ graph    render [--format mermaid]
           ├ sync     linear push|pull [--label linear]
           └ db       migrate|status
```

### Command Examples

```bash
# list open tasks
astrolabe task list --status todo

# quick capture
astrolabe task add "Add OAuth flow" --parent epic:auth

# one-shot context bundle for an agent
astrolabe context show 123e456-…

# push tasks tagged #linear
astrolabe sync linear push
```

---

## 8 Sync & Offline Semantics

* ElectricSQL streams WAL deltas; CRDT merge.
* Writes queue locally → push on reconnection.
* Rich-field conflicts (`prd`) flagged for manual merge.

---

## 9 Security Model

| Aspect    | Approach                                |
| --------- | --------------------------------------- |
| At-Rest   | SQLCipher encryption on `astrolabe.db`. |
| In-Flight | HTTPS + JWT (per-project secrets).      |
| Secrets   | Stored in OS keychain, never in DB.     |

---

## 10 Performance Targets

| Operation                | 95-pctl                |
| ------------------------ | ---------------------- |
| `task list` (< 300 rows) | ≤ 150 ms               |
| `getTaskContext`         | ≤ 400 ms               |
| Apply 1 k sync rows      | ≤ 3 s (Apple M-series) |

---

## 11 Developer Experience

* `npx astrolabe init` → DB + MCP scaffold.
* Hot-reload MCP when Zod schemas change.
* `astrolabe graph render` → Mermaid for README/PR.
* `astrolabe prd import docs/login.md` → autogenerate epics + tasks.

---

## 12 Milestones

| Phase  | Deliverables                             |
| ------ | ---------------------------------------- |
| **M0** | Repo scaffold, Zod schemas, local CRUD.  |
| **M1** | MCP functions & CLI (`task`, `context`). |
| **M2** | ElectricSQL sync; integration tests.     |
| **M3** | Context Resolver / embeddings.           |
| **M4** | VS Code sidebar, graph command.          |
| **M5** | Linear adapter; public beta.             |

---

## 13 Open Questions

1. Embeddings backend: pgvector vs `sqlite-vector`.
2. Merge strategy for large Markdown (`prd`).
3. Agent authentication: per-dev token vs project service account.

---

### **One-Sentence Pitch**

**Astrolabe** lets humans and agents plot a precise course through any project—offline-first, type-safe, and reachable with a single API call. 🌌

