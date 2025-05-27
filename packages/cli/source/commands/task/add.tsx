import type { NewTask } from "@astrolabe/core";
import { Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description = "Add a task";

export const options = zod.object({
	title: zod.string().describe("Task title"),
	description: zod.string().optional().describe("Task description"),
	parent: zod.string().optional().describe("Parent task ID"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Add({ options }: Props) {
	const db = useDatabase();
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function createTask() {
			try {
				const newTask: NewTask = {
					title: options.title,
					description: options.description || "",
					status: "pending",
					parentId: options.parent,
				};

				const task = await db.addTask(newTask);
				setResult(`Task created successfully: ${task.id}`);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to create task");
			}
		}
		createTask();
	}, [options, db]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;

	return <Text>Creating task...</Text>;
}
