import type { CreateTask, Task } from "@astrotask/core";
import { priorityScore } from "@astrotask/core";
import { Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description =
	"Add a new task with the specified title, description, and priority";

export const options = zod.object({
	title: zod.string().describe("Task title"),
	description: zod.string().optional().describe("Task description"),
	parent: zod.string().optional().describe("Parent task ID"),
	priorityScore: priorityScore
		.optional()
		.describe(
			"Priority score (0-100, higher = more important). Maps to levels: <20=low, 20-70=medium, >70=high",
		),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Add({ options }: Props) {
	const db = useDatabase();
	const [task, setTask] = useState<Task | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		async function createTask() {
			try {
				setLoading(true);
				const newTask: CreateTask = {
					title: options.title,
					description: options.description || "",
					parentId: options.parent,
					status: "pending",
					priorityScore: options.priorityScore,
				};

				const task = await db.addTask(newTask);
				setTask(task);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to create task");
			} finally {
				setLoading(false);
			}
		}
		createTask();
	}, [options, db]);

	if (loading) return <Text>Creating task...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;
	if (!task) return <Text color="red">No task created</Text>;

	const priorityLevel =
		task.priorityScore < 20
			? "low"
			: task.priorityScore <= 70
				? "medium"
				: "high";
	const scoreText = ` (${priorityLevel}: ${task.priorityScore})`;

	return (
		<Text color="green">
			✅ Created task: <Text bold>{task.id}</Text> - {task.title} {scoreText}
		</Text>
	);
}
