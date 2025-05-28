import type { Task } from "@astrolabe/core";
import { TaskService } from "@astrolabe/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description = "List tasks with status and priority information";

export default function List() {
	const db = useDatabase();
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadTasks() {
			try {
				const taskService = new TaskService(db);
				const syntheticTree = await taskService.getTaskTree();

				if (syntheticTree) {
					// Extract all tasks from the tree, excluding the synthetic root
					const allTasks: Task[] = [];
					syntheticTree.walkDepthFirst((node) => {
						if (node.task.id !== "__SYNTHETIC_ROOT__") {
							allTasks.push(node.task);
						}
					});
					setTasks(allTasks);
				} else {
					setTasks([]);
				}
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

	const rootTasks = tasks.filter((t) => !t.parentId);
	const subtasks = tasks.filter((t) => t.parentId);

	return (
		<Box flexDirection="column">
			<Text bold>Tasks ({tasks.length})</Text>
			{rootTasks.length > 0 && (
				<>
					<Text> </Text>
					<Text bold color="cyan">
						Root Tasks ({rootTasks.length})
					</Text>
					{rootTasks.map((task) => (
						<Box key={task.id} flexDirection="column" marginBottom={1}>
							<Text>
								<Text color="cyan">{task.id}</Text> -{" "}
								<Text bold>{task.title}</Text>
								{task.status && <Text color="yellow"> [{task.status}]</Text>}
								{task.priority && (
									<Text color="magenta"> [{task.priority}]</Text>
								)}
							</Text>
							{task.description && (
								<Text color="gray"> {task.description}</Text>
							)}
						</Box>
					))}
				</>
			)}
			{subtasks.length > 0 && (
				<>
					<Text> </Text>
					<Text bold color="green">
						Subtasks ({subtasks.length})
					</Text>
					{subtasks.map((task) => (
						<Box key={task.id} flexDirection="column" marginBottom={1}>
							<Text>
								<Text color="cyan">{task.id}</Text> -{" "}
								<Text bold>{task.title}</Text>
								{task.status && <Text color="yellow"> [{task.status}]</Text>}
								{task.priority && (
									<Text color="magenta"> [{task.priority}]</Text>
								)}
								<Text color="gray"> (parent: {task.parentId})</Text>
							</Text>
							{task.description && (
								<Text color="gray"> {task.description}</Text>
							)}
						</Box>
					))}
				</>
			)}
		</Box>
	);
}
