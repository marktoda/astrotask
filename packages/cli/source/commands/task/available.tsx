import type { AvailableTasksFilter, TrackingTaskTree } from "@astrotask/core";
import { priorityScore, taskStatus } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useAstrotask } from "../../context/DatabaseContext.js";

export const description = "List all available tasks that can be started";

export const options = zod.object({
	status: taskStatus.optional().describe("Filter by task status"),
	priorityScore: priorityScore
		.optional()
		.describe(
			"Filter by minimum priority score (0-100). Tasks with scores >= this value will be included",
		),
	parent: zod.string().optional().describe("Filter by parent task ID"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Available({ options }: Props) {
	const astrotask = useAstrotask();
	const [tasks, setTasks] = useState<TrackingTaskTree[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadAvailableTasks() {
			try {
				// NEW TREE API: Much simpler and more powerful
				const filter: AvailableTasksFilter = {
					status: options.status,
					priorityScore: options.priorityScore,
					parentId: options.parent,
				};

				const availableTasks = await astrotask.getAvailableTasks(filter);
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
	}, [options, astrotask]);

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
			options.status || options.priorityScore || options.parent
				? ` matching your filters`
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
		high: tasks.filter((t) => (t.task.priorityScore ?? 50) > 70),
		medium: tasks.filter((t) => {
			const score = t.task.priorityScore ?? 50;
			return score >= 20 && score <= 70;
		}),
		low: tasks.filter((t) => (t.task.priorityScore ?? 50) < 20),
	};

	const renderTaskGroup = (
		taskTrees: TrackingTaskTree[],
		level: "high" | "medium" | "low",
	) => {
		if (taskTrees.length === 0) return null;

		const colors = {
			high: "red",
			medium: "yellow",
			low: "blue",
		} as const;

		return (
			<Box flexDirection="column" marginTop={1}>
				<Text bold color={colors[level]}>
					{level.charAt(0).toUpperCase() + level.slice(1)} Priority (
					{taskTrees.length})
				</Text>
				{taskTrees.map((taskTree) => {
					const task = taskTree.task;
					const isBlocked = taskTree.isBlocked();
					const availableChildren = taskTree.getAvailableChildren().length;

					return (
						<Box
							key={task.id}
							marginLeft={2}
							marginBottom={1}
							flexDirection="column"
						>
							<Box>
								<Text>
									<Text color="cyan">{task.id}</Text> -{" "}
									<Text bold>{task.title}</Text>
									<Text color={getStatusColor(task.status)}>
										{" "}
										[{task.status}]
									</Text>
									<Text color="magenta"> [{task.priorityScore ?? 50}]</Text>
									{isBlocked && <Text color="red"> [BLOCKED]</Text>}
								</Text>
							</Box>
							{task.description && (
								<Box marginLeft={2}>
									<Text color="gray">{task.description}</Text>
								</Box>
							)}
							{/* Enhanced info from tree API */}
							{availableChildren > 0 && (
								<Box marginLeft={2}>
									<Text color="green">
										✅ {availableChildren} available subtask(s)
									</Text>
								</Box>
							)}
							{isBlocked && (
								<Box marginLeft={2}>
									<Text color="red">🚫 Blocked by dependencies</Text>
								</Box>
							)}
						</Box>
					);
				})}
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

			<Box marginTop={1} flexDirection="column">
				<Text color="green">
					💡 Enhanced with Tree API: Now shows blocking status and available
					subtasks
				</Text>
				<Text color="cyan">
					🎯 Try: astrotask task start-work &lt;task-id&gt; to begin work on a
					task
				</Text>
			</Box>
		</Box>
	);
}
