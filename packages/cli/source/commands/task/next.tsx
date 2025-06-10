import { priorityScore, taskStatus } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useTaskService } from "../../context/DatabaseContext.js";
import { formatPriority } from "../../utils/priority.js";

export const description =
	"Show the next available task to work on, based on status and completed dependencies";

export const options = zod.object({
	status: taskStatus.optional().describe("Filter by task status"),
	priorityScore: priorityScore
		.optional()
		.describe(
			"Filter by minimum priority score (0-100). Tasks with scores >= this value will be included",
		),
	root: zod
		.string()
		.optional()
		.describe(
			"Root task ID - limit search to direct children of this task. Use this to focus on a specific project or feature area.",
		),
});

type Props = {
	options: zod.infer<typeof options>;
};

// Simplified result type that avoids storing full task objects
interface NextTaskDisplay {
	taskId: string | null;
	title: string;
	status: string;
	priorityScore: number;
	description: string | null;
	message: string;
	availableCount: number;
	hasContext: boolean;
}

export default function Next({ options }: Props) {
	const taskService = useTaskService();
	const [display, setDisplay] = useState<NextTaskDisplay | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function getNextTask() {
			try {
				// Get available tasks (no incomplete dependencies)
				const availableTasks = await taskService.getAvailableTasks({
					status: options.status,
					priorityScore: options.priorityScore,
				});

				// Apply parent filter if specified (similar to MCP parentTaskId filtering)
				let filteredTasks = availableTasks;
				if (options.root) {
					filteredTasks = availableTasks.filter(
						(task) => task.parentId === options.root,
					);
				}

				// Find the highest priority pending task (using priority scores)
				const nextTask =
					filteredTasks
						.filter((task) => task.status === "pending")
						.sort((a, b) => {
							// Sort by priority score (higher score = higher priority), then by ID
							const aScore = a.priorityScore ?? 50; // Default to 50 if not set
							const bScore = b.priorityScore ?? 50; // Default to 50 if not set

							if (aScore !== bScore) {
								return bScore - aScore; // Higher scores first
							}

							return a.id.localeCompare(b.id);
						})[0] || null;

				const message = nextTask
					? `Next task to work on: ${nextTask.title}`
					: filteredTasks.length > 0
						? "No pending tasks available (all tasks are in progress or completed)"
						: options.root
							? `No tasks available under root ${options.root}`
							: "No tasks available";

				// Create simplified display object without storing full task objects
				setDisplay({
					taskId: nextTask?.id || null,
					title: nextTask?.title || "",
					status: nextTask?.status || "",
					priorityScore: nextTask?.priorityScore || 50,
					description: nextTask?.description || null,
					message,
					availableCount: filteredTasks.length,
					hasContext: !!nextTask,
				});
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to get next task",
				);
			} finally {
				setLoading(false);
			}
		}
		getNextTask();
	}, [options, taskService]);

	// Exit the process after operation is complete (like expand command)
	useEffect(() => {
		if (!loading && (display || error)) {
			// Use setTimeout to ensure the component has fully rendered
			setTimeout(() => {
				process.exit(error ? 1 : 0);
			}, 100);
		}
	}, [loading, display, error]);

	if (loading) return <Text>Loading next task...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;
	if (!display) return <Text color="red">No result available</Text>;

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

	// If no next task available
	if (!display.taskId) {
		return (
			<Box flexDirection="column">
				<Text bold color="yellow">
					No Next Task Available
				</Text>
				<Text>{display.message}</Text>

				{display.availableCount > 0 && (
					<Box flexDirection="column" marginTop={1}>
						<Text>
							There are {display.availableCount} available tasks, but none are
							pending.
						</Text>
					</Box>
				)}

				<Box marginTop={1}>
					<Text color="green">
						💡 Use <Text color="cyan">astrotask task list</Text> to see all
						tasks
						{options.root ? (
							<>
								{" "}
								or{" "}
								<Text color="cyan">
									astrotask task list --parent {options.root}
								</Text>{" "}
								to see tasks under this root
							</>
						) : (
							""
						)}{" "}
						or{" "}
						<Text color="cyan">
							astrotask task update &lt;task-id&gt; --status in-progress
						</Text>{" "}
						to begin working on a specific task
					</Text>
				</Box>
			</Box>
		);
	}

	// Display the next task
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="green"
			padding={1}
		>
			<Text bold color="green">
				Next Task{options.root ? ` (under root ${options.root})` : ""}
			</Text>

			<Box flexDirection="column" marginTop={1}>
				<Text>
					<Text color="cyan" bold>
						{display.taskId}
					</Text>{" "}
					- <Text bold>{display.title}</Text>
				</Text>
				<Text>
					Status:{" "}
					<Text color={getStatusColor(display.status)}>{display.status}</Text> |
					Priority:{" "}
					<Text color="magenta">{formatPriority(display.priorityScore)}</Text>
				</Text>

				{display.description && (
					<Box marginTop={1}>
						<Text color="gray">{display.description}</Text>
					</Box>
				)}
			</Box>

			<Box marginTop={1}>
				<Text color="green">
					💡 Use{" "}
					<Text color="cyan">
						astrotask task update {display.taskId} --status in-progress
					</Text>{" "}
					to start working on this task
				</Text>
			</Box>
		</Box>
	);
}
