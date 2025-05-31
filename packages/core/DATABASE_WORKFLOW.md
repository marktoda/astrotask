# Database Workflow: Schema-First Electric SQL

This document outlines the sophisticated schema-first workflow for managing databases with **Drizzle + PGlite locally** and **ElectricSQL + Postgres in production**.

## Overview

The workflow keeps a single TypeScript schema as the source of truth, auto-generates SQL migrations, and ensures those migrations work seamlessly in both local and production environments.

| Environment | What happens | Command |
|------------|-------------|---------|
| **Local (PGlite)** | • Creates/upgrades embedded DB at app boot<br>• Ignores `ENABLE ELECTRIC` statements | App startup (automatic) |
| **Production** | • Pipes SQL through Electric's proxy (port 65432)<br>• Proxy processes `ENABLE ELECTRIC` into triggers | `pnpm db:deploy` |

## 🏗️ Architecture

```
TypeScript Schema (schema.ts)
         ↓
    drizzle-kit generate
         ↓
    SQL Migrations (drizzle/)
         ↓
    Auto-electrify Script
         ↓
    Electrified Migrations
         ↓
┌─ Local: Runtime migrate() ─┐  ┌─ Remote: Electric Proxy ─┐
│  • PGlite ignores ELECTRIC │  │  • Converts to triggers   │
│  • Pure PostgreSQL SQL     │  │  • Sets up replication    │
└─────────────────────────────┘  └────────────────────────────┘
```

## 📁 File Structure

```
packages/core/
├── src/database/
│   └── schema.ts          # Single source of truth
├── drizzle/               # Generated migrations
│   ├── 20241201_*.sql    # Auto-electrified SQL
│   └── meta/             # Drizzle metadata
├── scripts/
│   └── patch-electrify.js # Auto-electrify tool
└── drizzle.config.ts     # Multi-environment config
```

## 🚀 Commands

### Development Workflow

```bash
# 1. Modify schema.ts
# 2. Generate migration from schema changes
pnpm db:generate

# 3. Auto-add ENABLE ELECTRIC statements
pnpm db:electrify

# 4. Combined: generate + electrify
pnpm db:setup
```

### Local Development
- **Migrations run automatically** at app startup via `migrate(db, { migrationsFolder: 'drizzle' })`
- PGlite ignores `ENABLE ELECTRIC` statements
- No manual migration command needed

### Production Deployment

```bash
# Deploy to production with Electric proxy
pnpm db:deploy  # Runs: db:setup && db:migrate:remote
```

## 🔧 Configuration

### Environment Variables

**Local Development (.env):**
```bash
DATABASE_URL=file:astrolabe.db
ELECTRIC_URL=http://localhost:3000
DB_VERBOSE=false
```

**Production (.env.production):**
```bash
# Electric proxy connection (port 65432)
PGHOST=your-electric-host.com
PGPORT=65432
PGUSER=postgres
PGPASSWORD=your-proxy-password
PGDATABASE=electric
PGSSL=true
```

### Drizzle Config (`drizzle.config.ts`)

The config automatically detects environment and switches between:
- **Local**: File-based PGlite connection
- **Remote**: Electric proxy connection for migrations

## 📋 Step-by-Step Workflow

### 1. Schema Changes

Edit `src/database/schema.ts`:

```typescript
export const newTable = pgTable('new_table', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 2. Generate Migration

```bash
pnpm db:generate
```

Creates: `drizzle/20241201123456_new_table.sql`

### 3. Auto-Electrify

```bash
pnpm db:electrify
```

Adds to migration:
```sql
CREATE TABLE "new_table" (...);
ALTER TABLE "new_table" ENABLE ELECTRIC;  -- 👈 Added automatically
```

### 4. Test Locally

Start your app - migrations apply automatically:
```bash
pnpm dev
```

### 5. Deploy to Production

```bash
pnpm db:deploy
```

## 🔌 How Electrification Works

The `scripts/patch-electrify.js` script:

1. **Scans** all SQL files in `drizzle/`
2. **Finds** `CREATE TABLE` statements
3. **Appends** `ALTER TABLE <name> ENABLE ELECTRIC;`
4. **Preserves** existing electrification (idempotent)

### Example Before/After:

**Before electrification:**
```sql
CREATE TABLE "tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL
);
```

**After electrification:**
```sql
CREATE TABLE "tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL
);
ALTER TABLE "tasks" ENABLE ELECTRIC;
```

## 🎯 Benefits

### ✅ What You Gain

1. **Single Schema Source** - TypeScript schema drives everything
2. **Automatic Electrification** - No manual `ENABLE ELECTRIC` management
3. **Environment Agnostic** - Same SQL works locally and in production
4. **Type Safety** - Full TypeScript types for database operations
5. **Git-Friendly** - Migrations are versioned and reviewable
6. **Zero Downtime** - Migrations through Electric proxy are non-blocking

### 🔄 Migration States

- **Generated**: Fresh from schema (not electrified)
- **Electrified**: Ready for both local and production
- **Applied Local**: Tables created in PGlite
- **Applied Remote**: Tables created + Electric triggers active

## 🚨 Important Notes

1. **Always electrify before deploying** - Run `pnpm db:setup` after schema changes
2. **ENABLE ELECTRIC must be in table creation migration** - Can't be added later
3. **Electric proxy is required for remote migrations** - Don't run against raw Postgres
4. **PGlite ignores Electric statements** - Safe to run locally

## 🔍 Troubleshooting

### Migration Not Generated
```bash
# Check for schema changes
pnpm db:generate
# Output: "No schema changes, nothing to migrate 😴"
```

### Missing ENABLE ELECTRIC
```bash
# Re-run electrification
pnpm db:electrify
# Check output for processed tables
```

### Remote Migration Fails
```bash
# Verify Electric proxy environment variables
echo $PGHOST $PGPORT $PGPASSWORD
# Should point to Electric proxy (port 65432)
```

### Syntax Error: "ELECTRIC"
- You're running against raw Postgres instead of Electric proxy
- Set correct `PGHOST` and `PGPORT` for Electric proxy

## 📚 Further Reading

- [Electric SQL Migrations](https://legacy.electric-sql.com/docs/usage/data-modelling/electrification)
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations)
- [PGlite + Electric Integration](https://pglite.dev/docs/sync) 