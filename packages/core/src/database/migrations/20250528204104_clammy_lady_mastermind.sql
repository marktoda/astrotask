CREATE TABLE "task_dependencies" (
	"id" text PRIMARY KEY NOT NULL,
	"dependent_task_id" text NOT NULL,
	"dependency_task_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_dependency" UNIQUE("dependent_task_id","dependency_task_id"),
	CONSTRAINT "no_self_dependency" CHECK ("task_dependencies"."dependent_task_id" != "task_dependencies"."dependency_task_id")
);
--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependent_task_id_tasks_id_fk" FOREIGN KEY ("dependent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependency_task_id_tasks_id_fk" FOREIGN KEY ("dependency_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;