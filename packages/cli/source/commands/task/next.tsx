import type { Task } from "@astrolabe/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { useTaskService } from "../../context/DatabaseContext.js";

export const description =
	"Get the next task to work on (highest priority task with no incomplete dependencies)";

export default function Next() {
	const taskService = useTaskService();
	const [task, setTask] = useState<Task | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadNextTask() {
			try {
				const nextTask = await taskService.getNextTask();
				setTask(nextTask);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load next task",
				);
			} finally {
				setLoading(false);
			}
		}
		loadNextTask();
	}, [taskService]);

	if (loading) return <Text>Finding your next task...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;

	const getStatusColor = (status: string) => {
		switch (status) {
			case "done":
				return "green";
			case "in-progress":
				return "yellow";
			case "pending":
				return "gray";
			default:
				return "white";
		}
	};

	const getPriorityColor = (priority: string) => {
		switch (priority) {
			case "high":
				return "red";
			case "medium":
				return "yellow";
			case "low":
				return "blue";
			default:
				return "white";
		}
	};

	if (!task) {
		return (
			<Box flexDirection="column">
				<Text bold color="green">
					🎉 No tasks available!
				</Text>
				<Text color="gray">
					All your pending tasks have incomplete dependencies or there are no
					pending tasks.
				</Text>
				<Text color="gray">
					Use <Text color="cyan">astrolabe task available</Text> to see all
					tasks that could be started.
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold>📋 Next Task</Text>
			<Text color="gray">
				Based on priority and dependencies, here's your next task:
			</Text>

			<Box flexDirection="column" marginTop={1} padding={1} borderStyle="round">
				<Text>
					<Text color="cyan">{task.id}</Text>
				</Text>
				<Text bold>{task.title}</Text>

				<Box marginTop={1}>
					<Text>
						Status:{" "}
						<Text color={getStatusColor(task.status)}>{task.status}</Text>
						{" | "}
						Priority:{" "}
						<Text color={getPriorityColor(task.priority)}>{task.priority}</Text>
					</Text>
				</Box>

				{task.description && (
					<Box marginTop={1}>
						<Text color="gray">{task.description}</Text>
					</Box>
				)}

				<Box marginTop={1}>
					<Text color="gray">
						Created: {task.createdAt.toLocaleDateString()}
					</Text>
				</Box>
			</Box>

			<Box marginTop={1}>
				<Text color="green">
					💡 Ready to start? Use{" "}
					<Text color="cyan">
						astrolabe task update {task.id} --status in-progress
					</Text>
				</Text>
			</Box>
		</Box>
	);
}
