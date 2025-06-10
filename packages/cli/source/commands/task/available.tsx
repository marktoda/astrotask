import type { Task } from "@astrotask/core";
import { priorityScore, taskStatus } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useTaskService } from "../../context/DatabaseContext.js";

export const description = "List all available tasks that can be started";

export const options = zod.object({
	status: taskStatus.optional().describe("Filter by task status"),
	priorityScore: priorityScore
		.optional()
		.describe(
			"Filter by minimum priority score (0-100). Tasks with scores >= this value will be included",
		),
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
				const filter: { status?: any; priorityScore?: number } = {};
				if (options.status) filter.status = options.status;
				if (options.priorityScore) filter.priorityScore = options.priorityScore;

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
			options.status || options.priorityScore
				? ` matching your filters (status: ${options.status || "any"}, priorityScore: ${options.priorityScore || "any"})`
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

	// Group by priority level for better organization
	const tasksByPriority = {
		high: tasks.filter((t) => t.priorityScore > 70),
		medium: tasks.filter((t) => t.priorityScore >= 20 && t.priorityScore <= 70),
		low: tasks.filter((t) => t.priorityScore < 20),
	};

	const renderTaskGroup = (tasks: Task[], level: "high" | "medium" | "low") => {
		if (tasks.length === 0) return null;

		const colors = {
			high: "red",
			medium: "yellow",
			low: "blue",
		} as const;

		return (
			<Box flexDirection="column" marginTop={1}>
				<Text bold color={colors[level]}>
					{level.charAt(0).toUpperCase() + level.slice(1)} Priority (
					{tasks.length})
				</Text>
				{tasks.map((task) => (
					<Box key={task.id} marginLeft={2} marginBottom={1}>
						<Text>
							<Text color="cyan">{task.id}</Text> -{" "}
							<Text bold>{task.title}</Text>
							<Text color={getStatusColor(task.status)}> [{task.status}]</Text>
							<Text color="magenta"> [{task.priorityScore}]</Text>
						</Text>
						{task.description && (
							<Box marginLeft={2}>
								<Text color="gray">{task.description}</Text>
							</Box>
						)}
					</Box>
				))}
			</Box>
		);
	};

	return (
		<Box flexDirection="column">
			<Text bold>Available Tasks ({tasks.length})</Text>
			<Text color="gray">
				These tasks can be started immediately - no incomplete dependencies
			</Text>

			{renderTaskGroup(tasksByPriority.high, "high")}
			{renderTaskGroup(tasksByPriority.medium, "medium")}
			{renderTaskGroup(tasksByPriority.low, "low")}

			<Box marginTop={1}>
				<Text color="green">
					💡 Tip: Use{" "}
					<Text color="cyan">astrotask task dependencies &lt;task-id&gt;</Text>{" "}
					to see why other tasks are blocked
				</Text>
			</Box>
		</Box>
	);
}
