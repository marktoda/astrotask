ALTER TABLE "tasks" DROP CONSTRAINT "status_check";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority_score" real DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "priority_score_check" CHECK ("tasks"."priority_score" >= 0 AND "tasks"."priority_score" <= 100);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "status_check" CHECK ("tasks"."status" IN ('pending', 'in-progress', 'blocked', 'done', 'cancelled', 'archived'));