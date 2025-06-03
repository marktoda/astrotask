// @ts-nocheck
import { relations, sql } from 'drizzle-orm';
import { check, foreignKey, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/*
  Drizzle ORM schema definition for Astrolabe using SQLite.
  The schema mirrors the PostgreSQL schema located in schema.ts and
  the Zod validation schemas located in src/schemas/*. Each table uses
  TEXT primary keys (UUIDs stored as TEXT). Timestamps use INTEGER
  to store Unix timestamps for SQLite compatibility.
  
  NOTE: Types are defined in src/schemas/* to avoid duplication. This file only
  defines the database table structure with proper enum constraints for SQLite.
*/

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id'),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: ['pending', 'in-progress', 'done', 'cancelled', 'archived'] })
      .notNull()
      .default('pending'),
    priority: text('priority', { enum: ['low', 'medium', 'high'] })
      .notNull()
      .default('medium'),

    prd: text('prd'),
    contextDigest: text('context_digest'),

    // SQLite doesn't have built-in timestamp types, use INTEGER for Unix timestamps
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
    }),
    check(
      'status_check',
      sql`${table.status} IN ('pending', 'in-progress', 'done', 'cancelled', 'archived')`
    ),
    check('priority_check', sql`${table.priority} IN ('low', 'medium', 'high')`),
  ]
);

// ---------------------------------------------------------------------------
// task_dependencies
// ---------------------------------------------------------------------------
export const taskDependencies = sqliteTable(
  'task_dependencies',
  {
    id: text('id').primaryKey(),
    dependentTaskId: text('dependent_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependencyTaskId: text('dependency_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    // Ensure no duplicate dependencies
    unique('unique_dependency').on(table.dependentTaskId, table.dependencyTaskId),
    // Prevent self-dependencies
    check('no_self_dependency', sql`${table.dependentTaskId} != ${table.dependencyTaskId}`),
  ]
);

// ---------------------------------------------------------------------------
// context_slices
// ---------------------------------------------------------------------------
export const contextSlices = sqliteTable('context_slices', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),

  taskId: text('task_id').references(() => tasks.id),
  contextDigest: text('context_digest'),

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

// @ts-expect-error - Drizzle relation type inference issue under exactOptionalPropertyTypes
export const taskRelations = relations(tasks, ({ one, many }) => ({
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

// @ts-expect-error - Drizzle relation type inference issue under exactOptionalPropertyTypes
export const taskDependencyRelations = relations(taskDependencies, ({ one }) => ({
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

// @ts-expect-error - Drizzle relation type inference issue under exactOptionalPropertyTypes
export const contextSliceRelations = relations(contextSlices, ({ one }) => ({
  task: one(tasks, {
    fields: [contextSlices.taskId],
    references: [tasks.id],
  }),
}));

// ---------------------------------------------------------------------------
// Export grouped schema to allow `drizzle(db, { schema })`
// ---------------------------------------------------------------------------
export const schema = {
  tasks,
  taskDependencies,
  contextSlices,
  taskRelations,
  taskDependencyRelations,
  contextSliceRelations,
};
