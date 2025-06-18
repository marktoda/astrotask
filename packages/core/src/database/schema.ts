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
import { DatabaseAdapterError } from './errors.js';

/*
  Unified Drizzle ORM schema definition for Astrotask.
  This schema works with all supported database adapters:
  - PostgreSQL (with postgres-js)
  - PGLite (embedded PostgreSQL)
  - SQLite (with better-sqlite3)
  
  The schema uses a factory pattern with adapter-specific column builders
  to handle differences between database types, primarily timestamp handling:
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
 * Shared task status enum and constraint definitions
 */
const TASK_STATUS_ENUM = [
  'pending',
  'in-progress',
  'blocked',
  'done',
  'cancelled',
  'archived',
] as const;

/**
 * Common constraint SQL templates
 */
const CONSTRAINTS = {
  statusCheck: (statusColumn: unknown) =>
    sql`${statusColumn} IN ('pending', 'in-progress', 'blocked', 'done', 'cancelled', 'archived')`,
  priorityScoreCheck: (priorityColumn: unknown) =>
    sql`${priorityColumn} >= 0 AND ${priorityColumn} <= 100`,
  noSelfDependency: (dependentCol: unknown, dependencyCol: unknown) =>
    sql`${dependentCol} != ${dependencyCol}`,
};

/**
 * Common relationship definitions factory
 */
function createRelations(tables: {
  tasks: unknown;
  taskDependencies: unknown;
  contextSlices: unknown;
}) {
  const { tasks, taskDependencies, contextSlices } = tables;

  const taskRelations = relations(tasks, ({ one, many }) => ({
    parent: one(tasks, {
      fields: [tasks.parentId],
      references: [tasks.id],
    }),
    children: many(tasks),
    contextSlices: many(contextSlices),
    dependencies: many(taskDependencies, {
      relationName: 'taskDependencies',
    }),
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

  return {
    taskRelations,
    taskDependencyRelations,
    contextSliceRelations,
  };
}

/**
 * Create PostgreSQL/PGLite schema
 */
function createPostgresSchema() {
  const tasks = pgTable(
    'tasks',
    {
      id: text('id').primaryKey(),
      parentId: text('parent_id'),
      title: text('title').notNull(),
      description: text('description'),
      status: text('status', { enum: TASK_STATUS_ENUM }).notNull().default('pending'),
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
      check('status_check', CONSTRAINTS.statusCheck(table.status)),
      check('priority_score_check', CONSTRAINTS.priorityScoreCheck(table.priorityScore)),
    ]
  );

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
      unique('unique_dependency').on(table.dependentTaskId, table.dependencyTaskId),
      check(
        'no_self_dependency',
        CONSTRAINTS.noSelfDependency(table.dependentTaskId, table.dependencyTaskId)
      ),
    ]
  );

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

  const relations = createRelations({ tasks, taskDependencies, contextSlices });

  return {
    tasks,
    taskDependencies,
    contextSlices,
    ...relations,
  };
}

/**
 * Create SQLite schema
 */
function createSqliteSchema() {
  const tasks = sqliteTable(
    'tasks',
    {
      id: sqliteText('id').primaryKey(),
      parentId: sqliteText('parent_id'),
      title: sqliteText('title').notNull(),
      description: sqliteText('description'),
      status: sqliteText('status', { enum: TASK_STATUS_ENUM }).notNull().default('pending'),
      priorityScore: sqliteReal('priority_score').notNull().default(50.0),
      prd: sqliteText('prd'),
      contextDigest: sqliteText('context_digest'),
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
      sqliteCheck('status_check', CONSTRAINTS.statusCheck(table.status)),
      sqliteCheck('priority_score_check', CONSTRAINTS.priorityScoreCheck(table.priorityScore)),
    ]
  );

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
      sqliteUnique('unique_dependency').on(table.dependentTaskId, table.dependencyTaskId),
      sqliteCheck(
        'no_self_dependency',
        CONSTRAINTS.noSelfDependency(table.dependentTaskId, table.dependencyTaskId)
      ),
    ]
  );

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

  const relations = createRelations({ tasks, taskDependencies, contextSlices });

  return {
    tasks,
    taskDependencies,
    contextSlices,
    ...relations,
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
      throw new DatabaseAdapterError(
        `Unsupported adapter type: ${adapterType}`,
        'schema',
        adapterType
      );
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
