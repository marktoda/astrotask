import type { Task } from "@astrolabe/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description = "List tasks, optionally filtered by project";

export default function List() {
	const db = useDatabase();
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadTasks() {
			try {
				const allTasks = await db.listTasks();
				setTasks(allTasks);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load tasks");
			} finally {
				setLoading(false);
			}
		}
		loadTasks();
	}, [db]);

	if (loading) return <Text>Loading tasks...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;

	if (tasks.length === 0) {
		return (
			<Box flexDirection="column">
				<Text>No tasks found.</Text>
				<Text>
					Use <Text color="cyan">astrolabe task add --title="Task name"</Text>{" "}
					to create your first task.
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold>Tasks ({tasks.length})</Text>
			<Text> </Text>
			{tasks.map((task) => (
				<Box key={task.id} flexDirection="column" marginBottom={1}>
					<Text>
						<Text color="cyan">{task.id}</Text> - <Text bold>{task.title}</Text>
						{task.status && <Text color="yellow"> [{task.status}]</Text>}
					</Text>
					{task.description && <Text color="gray"> {task.description}</Text>}
				</Box>
			))}
		</Box>
	);
}
