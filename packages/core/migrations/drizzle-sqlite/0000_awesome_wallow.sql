CREATE TABLE `context_slices` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`task_id` text,
	`context_digest` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`dependent_task_id` text NOT NULL,
	`dependency_task_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`dependent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dependency_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "no_self_dependency" CHECK("task_dependencies"."dependent_task_id" != "task_dependencies"."dependency_task_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_dependency` ON `task_dependencies` (`dependent_task_id`,`dependency_task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`priority_score` real DEFAULT 50 NOT NULL,
	`prd` text,
	`context_digest` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "status_check" CHECK("tasks"."status" IN ('pending', 'in-progress', 'blocked', 'done', 'cancelled', 'archived')),
	CONSTRAINT "priority_check" CHECK("tasks"."priority" IN ('low', 'medium', 'high')),
	CONSTRAINT "priority_score_check" CHECK("tasks"."priority_score" >= 0 AND "tasks"."priority_score" <= 100)
);
