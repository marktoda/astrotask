// @ts-nocheck
import { relations, sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

/*
  Drizzle ORM schema definition for Astrolabe using PostgreSQL (PGlite).
  The schema mirrors the Zod validation schemas located in src/schemas/* and
  is designed to work with ElectricSQL CRDT replication. Each table uses
  UUID primary keys (stored as TEXT). Timestamps use PostgreSQL's NOW() function
  for maximum cross-platform consistency with PostgreSQL-based ElectricSQL.
  
  NOTE: Types are defined in src/schemas/* to avoid duplication. This file only
  defines the database table structure with proper enum constraints.
*/

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------
export const tasks = pgTable(
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
      sql`${table.status} IN ('pending', 'in-progress', 'done', 'cancelled', 'archived')`
    ),
    check('priority_check', sql`${table.priority} IN ('low', 'medium', 'high')`),
  ]
);

// ---------------------------------------------------------------------------
// task_dependencies
// ---------------------------------------------------------------------------
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id: text('id').primaryKey(),
    dependentTaskId: text('dependent_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    dependencyTaskId: text('dependency_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Ensure no duplicate dependencies
    unique('unique_dependency').on(table.dependentTaskId, table.dependencyTaskId),
    // Prevent self-dependencies
    check(
      'no_self_dependency',
      sql`${table.dependentTaskId} != ${table.dependencyTaskId}`
    ),
  ]
);

// ---------------------------------------------------------------------------
// context_slices
// ---------------------------------------------------------------------------
export const contextSlices = pgTable('context_slices', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),

  taskId: text('task_id').references(() => tasks.id),
  contextDigest: text('context_digest'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
