import { taskPriority, taskStatus, priorityScore } from "@astrotask/core";
import { Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description = "Update a task";

export const options = zod.object({
	id: zod.string().describe("Task ID to update"),
	title: zod.string().optional().describe("New task title"),
	description: zod.string().optional().describe("New task description"),
	status: taskStatus.optional().describe("New task status"),
	priority: taskPriority.optional().describe("New task priority"),
	priorityScore: priorityScore.optional().describe("New priority score (0-100, higher = more important)"),
	parent: zod.string().optional().describe("New parent task ID"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Update({ options }: Props) {
	const db = useDatabase();
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function updateTask() {
			try {
				// biome-ignore lint/complexity/useLiteralKeys: dynamic property assignment needed
				const updates: Record<string, unknown> = {};
				if (options.title) updates["title"] = options.title;
				if (options.description !== undefined)
					updates["description"] = options.description;
				if (options.status) updates["status"] = options.status;
				if (options.priority) updates["priority"] = options.priority;
				if (options.priorityScore !== undefined) updates["priorityScore"] = options.priorityScore;
				if (options.parent !== undefined) updates["parentId"] = options.parent;

				const updated = await db.updateTask(options.id, updates);
				if (!updated) throw new Error("Task not found or no changes");
				setResult(`Task ${options.id} updated successfully ✨`);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to update task");
			}
		}
		updateTask();
	}, [options, db]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;

	return <Text>Updating task...</Text>;
}
