CREATE TABLE "context_slices" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"task_id" text,
	"context_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" text PRIMARY KEY NOT NULL,
	"dependent_task_id" text NOT NULL,
	"dependency_task_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_dependency" UNIQUE("dependent_task_id","dependency_task_id"),
	CONSTRAINT "no_self_dependency" CHECK ("task_dependencies"."dependent_task_id" != "task_dependencies"."dependency_task_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"prd" text,
	"context_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_check" CHECK ("tasks"."status" IN ('pending', 'in-progress', 'done', 'cancelled', 'archived')),
	CONSTRAINT "priority_check" CHECK ("tasks"."priority" IN ('low', 'medium', 'high'))
);
--> statement-breakpoint
ALTER TABLE "context_slices" ADD CONSTRAINT "context_slices_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependent_task_id_tasks_id_fk" FOREIGN KEY ("dependent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependency_task_id_tasks_id_fk" FOREIGN KEY ("dependency_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "context_slices" ENABLE ELECTRIC;
ALTER TABLE "task_dependencies" ENABLE ELECTRIC;
ALTER TABLE "tasks" ENABLE ELECTRIC;