# Electric Schema Sync – Design Doc for Astrolabe Task Manager

## 1. Purpose & Scope

Define a simple, reliable way for **Astrolabe** clients (PGlite + Drizzle) to stay in lock‑step with the production Postgres schema managed by **ElectricSQL** while supporting offline use and seamless upgrades.

- **In scope:** schema distribution, migration workflow, client/bootstrap logic, failure handling.
- **Out of scope:** business logic, UI specifics, conflict resolution for writes (handled separately).

---

## 2. High‑Level Architecture

```
┌──────────────┐      WebSocket + Satellite      ┌───────────────┐
│  PGlite DB   │◀──────────────────────────────▶│ Electric Sync │
└─────▲────────┘                                   Service
      │ SQL replay & WAL deltas                    │ 3000/tcp  ↔  API
      │                                            │ 65432/tcp ↔ Migrations Proxy
┌─────┴────────┐                                   │
│   Drizzle    │  in‑process Driver               │
└──────────────┘                                   ▼
                                           ┌──────────────────┐
                                           │  Postgres (RDS)  │
                                           └──────────────────┘
```

_All schema‑changing DDL originates in Postgres → recorded by the proxy → streamed to every client on connect._

---

## 3. Source of Truth

- **TypeScript schema** (`src/database/schema.ts`) maintained with Drizzle.
- Automatic SQL migrations generated via `drizzle-kit generate`.
- _After_ generation a small script appends `ALTER TABLE <name> ENABLE ELECTRIC;` to each `CREATE TABLE` statement.
- These augmented migration files are **the only migrations** committed to git and deployed.

---

## 4. Migration Workflow

| Step | Actor | Command                                    | Notes                                           |
| ---- | ----- | ------------------------------------------ | ----------------------------------------------- |
| 1    | Dev   | `pnpm db:generate`                         | Produce raw SQL.                                |
| 2    | Dev   | `pnpm db:electrify`                        | Run `scripts/patch-electrify.js`.               |
| 3    | CI    | `drizzle-kit push` against `PG_PROXY_PORT` | Proxy stores SHA + forwards to Postgres.        |
| 4    | CI    | (optional) `electric generate`             | Generates typed client from electrified schema. |

_Rollback_ = apply down migration through the same proxy.

---

## 5. Client Bootstrap Logic

```ts
const pg = await PGlite.create({ extensions: { electric: electricSync() } });
await pg.electric.connect(ELECTRIC_URL);
await pg.electric.ready(); // waits until all missing migrations applied
```

- **First launch liveness:** bundle a minified _seed DB_ (`seed.db`) containing an empty but fully‑migrated schema to avoid cold‑start failure when server is offline.
- On launch, if `local.db` is missing, copy `seed.db` → `local.db` before opening.

---

## 6. Satellite Handshake & Schema Updates

1. Client sends `clientMigrationHash` (last known SHA).
2. Server diffs against `_electric_meta.migrations`.
3. Streams missing migrations → client executes inside a transaction.
4. Upon hash match, server starts streaming WAL changes.

Supported DDL in replay: `CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `CREATE/DROP INDEX`. Destructive changes require versioned reset.

---

## 7. Failure Modes

| Scenario                               | Behaviour                                                              | Mitigation                                                         |
| -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Server unreachable at start            | `ready()` rejects after 10 s                                           | Run in _offline‑read_ mode using seed DB, disable writes.          |
| Drop during sync                       | Extension emits `status.connected=false`; retries exponential (1→60 s) | Display offline banner; queue writes in Outbox.                    |
| Migration hash mismatch (client ahead) | Handshake aborts                                                       | Force local DB reset (delete file) or ship new server.             |
| Unsupported DDL in replay              | Replay error                                                           | Plan _migration‑first_ deployment or enforce additive‑only policy. |

---

## 8. Deployment & Environment Variables

| Var                    | Dev setting     | Prod setting    |
| ---------------------- | --------------- | --------------- |
| `DATABASE_URL`         | internal PG URL | same            |
| `HTTP_PORT`            | 3000            | 5133            |
| `PG_PROXY_PORT`        | 65432           | 65432           |
| `PG_PROXY_PASSWORD`    | dev‑secret      | strong secret   |
| `ELECTRIC_STORAGE_DIR` | `/data`         | volume mount    |
| `ELECTRIC_INSECURE`    | `true`          | unset (use JWT) |

---

## 9. Observability & Alerts

- Listen to `pg.electric.on('status', …)` and emit Prometheus counters:

  - `electric_connected` (gauge)
  - `electric_sync_lag_seconds` (histogram)

- Sentry breadcrumb on handshake errors.

---

## 10. Future Work

- Switch to `logical_replication` write path for full CRDT support.
- Auto‑generate seed DB in CI from latest migrations.
- Tooling to diff local schema vs expected and prompt reset.

---

## 11. Open Questions

1. Production policy for destructive migrations?
2. Strategy to shrink seed DB over time?
3. Rollback mechanics when migration has already propagated to some clients but fails on others?
