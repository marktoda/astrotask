import { relations, sql } from 'drizzle-orm';
import { foreignKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/*
  Drizzle ORM schema definition for Astrolabe.
  The schema mirrors the Zod validation schemas located in src/schemas/* and
  is designed to work with ElectricSQL CRDT replication.  Each table uses
  UUID primary keys (stored as TEXT).  Timestamps default to ISO-8601 strings
  via SQLite's strftime to maximise cross-platform consistency.
*/

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), // UUID
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'), // active | completed | archived
  priority: text('priority').notNull().default('medium'), // low | medium | high
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

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
    status: text('status').notNull().default('pending'), // pending | in-progress | done | cancelled

    prd: text('prd'),
    contextDigest: text('context_digest'),

    // Foreign references (nullable)
    projectId: text('project_id').references(() => projects.id),

    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => {
    return {
      parentFk: foreignKey({
        columns: [table.parentId],
        foreignColumns: [table.id],
      }),
    };
  }
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

// ---------------------------------------------------------------------------
// context_slices
// ---------------------------------------------------------------------------
export const contextSlices = sqliteTable('context_slices', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),

  taskId: text('task_id').references(() => tasks.id),
  projectId: text('project_id').references(() => projects.id),
  contextDigest: text('context_digest'),

  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ContextSlice = typeof contextSlices.$inferSelect;
export type NewContextSlice = typeof contextSlices.$inferInsert;

// ---------------------------------------------------------------------------
// Relationships (Drizzle helpers)
// ---------------------------------------------------------------------------

export const projectRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
  contextSlices: many(contextSlices),
}));

export const taskRelations = relations(tasks, ({ one, many }) => ({
  parent: one(tasks, {
    fields: [tasks.parentId],
    references: [tasks.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  children: many(tasks),
  contextSlices: many(contextSlices),
}));

export const contextSliceRelations = relations(contextSlices, ({ one }) => ({
  task: one(tasks, {
    fields: [contextSlices.taskId],
    references: [tasks.id],
  }),
  project: one(projects, {
    fields: [contextSlices.projectId],
    references: [projects.id],
  }),
}));

// ---------------------------------------------------------------------------
// Export grouped schema to allow `drizzle(db, { schema })`
// ---------------------------------------------------------------------------
export const schema = {
  projects,
  tasks,
  contextSlices,
};
