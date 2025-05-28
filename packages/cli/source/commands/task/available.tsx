import type { Task } from "@astrolabe/core";
import { taskPriority, taskStatus } from "@astrolabe/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useTaskService } from "../../context/DatabaseContext.js";

export const description =
	"List tasks that can be started immediately (no incomplete dependencies)";

export const options = zod.object({
	status: taskStatus.optional().describe("Filter by task status"),
	priority: taskPriority.optional().describe("Filter by task priority"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Available({ options }: Props) {
	const taskService = useTaskService();
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadAvailableTasks() {
			try {
				const filter: { status?: any; priority?: string } = {};
				if (options.status) filter.status = options.status;
				if (options.priority) filter.priority = options.priority;

				const availableTasks = await taskService.getAvailableTasks(filter);
				setTasks(availableTasks);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load available tasks",
				);
			} finally {
				setLoading(false);
			}
		}
		loadAvailableTasks();
	}, [options, taskService]);

	if (loading) return <Text>Loading available tasks...</Text>;
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

	if (tasks.length === 0) {
		const filterText =
			options.status || options.priority
				? ` matching your filters (status: ${options.status || "any"}, priority: ${options.priority || "any"})`
				: "";

		return (
			<Box flexDirection="column">
				<Text>No available tasks found{filterText}.</Text>
				<Text color="gray">
					Available tasks are those with no incomplete dependencies that can be
					started immediately.
				</Text>
			</Box>
		);
	}

	// Group by priority for better organization
	const tasksByPriority = {
		high: tasks.filter((t) => t.priority === "high"),
		medium: tasks.filter((t) => t.priority === "medium"),
		low: tasks.filter((t) => t.priority === "low"),
	};

	return (
		<Box flexDirection="column">
			<Text bold>Available Tasks ({tasks.length})</Text>
			<Text color="gray">
				These tasks can be started immediately - no incomplete dependencies
			</Text>

			{tasksByPriority.high.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="red">
						High Priority ({tasksByPriority.high.length})
					</Text>
					{tasksByPriority.high.map((task) => (
						<Box key={task.id} marginLeft={2} marginBottom={1}>
							<Text>
								<Text color="cyan">{task.id}</Text> -{" "}
								<Text bold>{task.title}</Text>
								<Text color={getStatusColor(task.status)}>
									{" "}
									[{task.status}]
								</Text>
							</Text>
							{task.description && (
								<Box marginLeft={2}>
									<Text color="gray">{task.description}</Text>
								</Box>
							)}
						</Box>
					))}
				</Box>
			)}

			{tasksByPriority.medium.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="yellow">
						Medium Priority ({tasksByPriority.medium.length})
					</Text>
					{tasksByPriority.medium.map((task) => (
						<Box key={task.id} marginLeft={2} marginBottom={1}>
							<Text>
								<Text color="cyan">{task.id}</Text> -{" "}
								<Text bold>{task.title}</Text>
								<Text color={getStatusColor(task.status)}>
									{" "}
									[{task.status}]
								</Text>
							</Text>
							{task.description && (
								<Box marginLeft={2}>
									<Text color="gray">{task.description}</Text>
								</Box>
							)}
						</Box>
					))}
				</Box>
			)}

			{tasksByPriority.low.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="blue">
						Low Priority ({tasksByPriority.low.length})
					</Text>
					{tasksByPriority.low.map((task) => (
						<Box key={task.id} marginLeft={2} marginBottom={1}>
							<Text>
								<Text color="cyan">{task.id}</Text> -{" "}
								<Text bold>{task.title}</Text>
								<Text color={getStatusColor(task.status)}>
									{" "}
									[{task.status}]
								</Text>
							</Text>
							{task.description && (
								<Box marginLeft={2}>
									<Text color="gray">{task.description}</Text>
								</Box>
							)}
						</Box>
					))}
				</Box>
			)}

			<Box marginTop={1}>
				<Text color="green">
					💡 Tip: Use{" "}
					<Text color="cyan">astrolabe task dependencies &lt;task-id&gt;</Text>{" "}
					to see why other tasks are blocked
				</Text>
			</Box>
		</Box>
	);
}
