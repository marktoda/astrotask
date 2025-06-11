import { relations, sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, real, text, timestamp, unique } from 'drizzle-orm/pg-core';
import {
  integer,
  check as sqliteCheck,
  foreignKey as sqliteForeignKey,
  real as sqliteReal,
  sqliteTable,
  text as sqliteText,
  unique as sqliteUnique,
} from 'drizzle-orm/sqlite-core';

/*
  Unified Drizzle ORM schema definition for Astrotask.
  This schema works with all supported database adapters:
  - PostgreSQL (with postgres-js)
  - PGLite (embedded PostgreSQL)
  - SQLite (with better-sqlite3)
  
  The schema uses adapter-specific column builders to handle the differences
  between database types, primarily timestamp handling:
  - PostgreSQL/PGLite: timestamp with timezone + NOW()
  - SQLite: integer with timestamp mode + $defaultFn(() => new Date())
  
  All tables use TEXT primary keys (UUIDs stored as TEXT) and follow the
  same structure as defined in src/schemas/*.
*/

/**
 * Adapter type identifier
 */
export type AdapterType = 'postgres' | 'pglite' | 'sqlite';

/**
 * Create PostgreSQL/PGLite schema
 */
function createPostgresSchema() {
  // ---------------------------------------------------------------------------
  // tasks table
  // ---------------------------------------------------------------------------
  const tasks = pgTable(
    'tasks',
    {
      id: text('id').primaryKey(),
      parentId: text('parent_id'),
      title: text('title').notNull(),
      description: text('description'),
      status: text('status', {
        enum: ['pending', 'in-progress', 'blocked', 'done', 'cancelled', 'archived'],
      })
        .notNull()
        .default('pending'),
      priorityScore: real('priority_score').notNull().default(50.0),

      prd: text('prd'),
      contextDigest: text('context_digest'),

      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      foreignKey({
        columns: [table.parentId],
        foreignColumns: [table.id],
      }),
      check(
        'status_check',
        sql`${table.status} IN ('pending', 'in-progress', 'blocked', 'done', 'cancelled', 'archived')`
      ),
      check(
        'priority_score_check',
        sql`${table.priorityScore} >= 0 AND ${table.priorityScore} <= 100`
      ),
    ]
  );

  // ---------------------------------------------------------------------------
  // task_dependencies table
  // ---------------------------------------------------------------------------
  const taskDependencies = pgTable(
    'task_dependencies',
    {
      id: text('id').primaryKey(),
      dependentTaskId: text('dependent_task_id')
        .notNull()
        .references(() => tasks.id, { onDelete: 'cascade' }),
      dependencyTaskId: text('dependency_task_id')
        .notNull()
        .references(() => tasks.id, { onDelete: 'cascade' }),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      // Ensure no duplicate dependencies
      unique('unique_dependency').on(table.dependentTaskId, table.dependencyTaskId),
      // Prevent self-dependencies
      check('no_self_dependency', sql`${table.dependentTaskId} != ${table.dependencyTaskId}`),
    ]
  );

  // ---------------------------------------------------------------------------
  // context_slices table
  // ---------------------------------------------------------------------------
  const contextSlices = pgTable('context_slices', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    contextType: text('context_type').notNull().default('general'),

    taskId: text('task_id').references(() => tasks.id),
    contextDigest: text('context_digest'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  });

  // ---------------------------------------------------------------------------
  // Relationships (Drizzle helpers)
  // ---------------------------------------------------------------------------

  const taskRelations = relations(tasks, ({ one, many }) => ({
    parent: one(tasks, {
      fields: [tasks.parentId],
      references: [tasks.id],
    }),
    children: many(tasks),
    contextSlices: many(contextSlices),
    // Dependencies where this task is the dependent (tasks this task depends on)
    dependencies: many(taskDependencies, {
      relationName: 'taskDependencies',
    }),
    // Dependencies where this task is the dependency (tasks that depend on this task)
    dependents: many(taskDependencies, {
      relationName: 'taskDependents',
    }),
  }));

  const taskDependencyRelations = relations(taskDependencies, ({ one }) => ({
    dependentTask: one(tasks, {
      fields: [taskDependencies.dependentTaskId],
      references: [tasks.id],
      relationName: 'taskDependencies',
    }),
    dependencyTask: one(tasks, {
      fields: [taskDependencies.dependencyTaskId],
      references: [tasks.id],
      relationName: 'taskDependents',
    }),
  }));

  const contextSliceRelations = relations(contextSlices, ({ one }) => ({
    task: one(tasks, {
      fields: [contextSlices.taskId],
      references: [tasks.id],
    }),
  }));

  // ---------------------------------------------------------------------------
  // Export grouped schema to allow `drizzle(db, { schema })`
  // ---------------------------------------------------------------------------
  return {
    tasks,
    taskDependencies,
    contextSlices,
    taskRelations,
    taskDependencyRelations,
    contextSliceRelations,
  };
}

/**
 * Create SQLite schema
 */
function createSqliteSchema() {
  // ---------------------------------------------------------------------------
  // tasks table
  // ---------------------------------------------------------------------------
  const tasks = sqliteTable(
    'tasks',
    {
      id: sqliteText('id').primaryKey(),
      parentId: sqliteText('parent_id'),
      title: sqliteText('title').notNull(),
      description: sqliteText('description'),
      status: sqliteText('status', {
        enum: ['pending', 'in-progress', 'blocked', 'done', 'cancelled', 'archived'],
      })
        .notNull()
        .default('pending'),
      priorityScore: sqliteReal('priority_score').notNull().default(50.0),

      prd: sqliteText('prd'),
      contextDigest: sqliteText('context_digest'),

      // SQLite doesn't have built-in timestamp types, use INTEGER for Unix timestamps
      createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
      updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    },
    (table) => [
      sqliteForeignKey({
        columns: [table.parentId],
        foreignColumns: [table.id],
      }),
      sqliteCheck(
        'status_check',
        sql`${table.status} IN ('pending', 'in-progress', 'blocked', 'done', 'cancelled', 'archived')`
      ),
      sqliteCheck(
        'priority_score_check',
        sql`${table.priorityScore} >= 0 AND ${table.priorityScore} <= 100`
      ),
    ]
  );

  // ---------------------------------------------------------------------------
  // task_dependencies table
  // ---------------------------------------------------------------------------
  const taskDependencies = sqliteTable(
    'task_dependencies',
    {
      id: sqliteText('id').primaryKey(),
      dependentTaskId: sqliteText('dependent_task_id')
        .notNull()
        .references(() => tasks.id, { onDelete: 'cascade' }),
      dependencyTaskId: sqliteText('dependency_task_id')
        .notNull()
        .references(() => tasks.id, { onDelete: 'cascade' }),
      createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    },
    (table) => [
      // Ensure no duplicate dependencies
      sqliteUnique('unique_dependency').on(table.dependentTaskId, table.dependencyTaskId),
      // Prevent self-dependencies
      sqliteCheck('no_self_dependency', sql`${table.dependentTaskId} != ${table.dependencyTaskId}`),
    ]
  );

  // ---------------------------------------------------------------------------
  // context_slices table
  // ---------------------------------------------------------------------------
  const contextSlices = sqliteTable('context_slices', {
    id: sqliteText('id').primaryKey(),
    title: sqliteText('title').notNull(),
    description: sqliteText('description'),
    contextType: sqliteText('context_type').notNull().default('general'),

    taskId: sqliteText('task_id').references(() => tasks.id),
    contextDigest: sqliteText('context_digest'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  });

  // ---------------------------------------------------------------------------
  // Relationships (Drizzle helpers)
  // ---------------------------------------------------------------------------

  const taskRelations = relations(tasks, ({ one, many }) => ({
    parent: one(tasks, {
      fields: [tasks.parentId],
      references: [tasks.id],
    }),
    children: many(tasks),
    contextSlices: many(contextSlices),
    // Dependencies where this task is the dependent (tasks this task depends on)
    dependencies: many(taskDependencies, {
      relationName: 'taskDependencies',
    }),
    // Dependencies where this task is the dependency (tasks that depend on this task)
    dependents: many(taskDependencies, {
      relationName: 'taskDependents',
    }),
  }));

  const taskDependencyRelations = relations(taskDependencies, ({ one }) => ({
    dependentTask: one(tasks, {
      fields: [taskDependencies.dependentTaskId],
      references: [tasks.id],
      relationName: 'taskDependencies',
    }),
    dependencyTask: one(tasks, {
      fields: [taskDependencies.dependencyTaskId],
      references: [tasks.id],
      relationName: 'taskDependents',
    }),
  }));

  const contextSliceRelations = relations(contextSlices, ({ one }) => ({
    task: one(tasks, {
      fields: [contextSlices.taskId],
      references: [tasks.id],
    }),
  }));

  // ---------------------------------------------------------------------------
  // Export grouped schema to allow `drizzle(db, { schema })`
  // ---------------------------------------------------------------------------
  return {
    tasks,
    taskDependencies,
    contextSlices,
    taskRelations,
    taskDependencyRelations,
    contextSliceRelations,
  };
}

/**
 * Create the schema for a specific adapter type
 */
export function createSchema(adapterType: AdapterType) {
  switch (adapterType) {
    case 'postgres':
    case 'pglite':
      return createPostgresSchema();
    case 'sqlite':
      return createSqliteSchema();
    default:
      throw new Error(`Unsupported adapter type: ${adapterType}`);
  }
}

// Pre-built schemas for each adapter type
export const postgresSchema = createPostgresSchema();
export const pgliteSchema = createPostgresSchema(); // PGLite uses same schema as PostgreSQL
export const sqliteSchema = createSqliteSchema();

// Default export for backward compatibility (PostgreSQL)
export const schema = postgresSchema;

// Re-export tables for backward compatibility
export const {
  tasks,
  taskDependencies,
  contextSlices,
  taskRelations,
  taskDependencyRelations,
  contextSliceRelations,
} = postgresSchema;
