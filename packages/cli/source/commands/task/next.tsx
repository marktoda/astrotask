import type { ContextSlice, Task, TaskTree } from "@astrotask/core";
import { taskPriority, taskStatus } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase, useTaskService } from "../../context/DatabaseContext.js";

export const description =
	"Show the next available task to work on, based on status and completed dependencies";

export const options = zod.object({
	status: taskStatus.optional().describe("Filter by task status"),
	priority: taskPriority.optional().describe("Filter by task priority"),
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

interface NextTaskResult {
	task: Task | null;
	availableTasks: Task[];
	message: string;
	context?: {
		ancestors: Task[];
		descendants: TaskTree[];
		root: TaskTree | null;
		dependencies: Task[];
		dependents: Task[];
		isBlocked: boolean;
		blockedBy: Task[];
		contextSlices: ContextSlice[];
	};
}

export default function Next({ options }: Props) {
	const store = useDatabase();
	const taskService = useTaskService();
	const [result, setResult] = useState<NextTaskResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function getNextTask() {
			try {
				// Get available tasks (no incomplete dependencies)
				const availableTasks = await taskService.getAvailableTasks({
					status: options.status,
					priority: options.priority,
				});

				// Apply parent filter if specified (similar to MCP parentTaskId filtering)
				let filteredTasks = availableTasks;
				if (options.root) {
					filteredTasks = availableTasks.filter(
						(task) => task.parentId === options.root,
					);
				}

				// Find the highest priority pending task (same logic as MCP)
				const nextTask =
					filteredTasks
						.filter((task) => task.status === "pending")
						.sort((a, b) => {
							// Sort by priority (high > medium > low), then by ID
							const priorityOrder = { high: 3, medium: 2, low: 1 };
							const aPriority =
								priorityOrder[a.priority as keyof typeof priorityOrder] || 1;
							const bPriority =
								priorityOrder[b.priority as keyof typeof priorityOrder] || 1;

							if (aPriority !== bPriority) {
								return bPriority - aPriority;
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

				let context = undefined;

				// If we have a next task, get its full context
				if (nextTask) {
					const taskWithContext = await taskService.getTaskWithContext(
						nextTask.id,
					);
					if (taskWithContext) {
						const contextSlices = await store.listContextSlices(nextTask.id);

						context = {
							ancestors: taskWithContext.ancestors,
							descendants: taskWithContext.descendants,
							root: taskWithContext.root,
							dependencies: taskWithContext.dependencies,
							dependents: taskWithContext.dependents,
							isBlocked: taskWithContext.isBlocked,
							blockedBy: taskWithContext.blockedBy,
							contextSlices,
						};
					}
				}

				setResult({
					task: nextTask,
					availableTasks: filteredTasks,
					message,
					context,
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
	}, [options, taskService, store]);

	// Exit the process after operation is complete (like expand command)
	useEffect(() => {
		if (!loading && (result || error)) {
			// Use setTimeout to ensure the component has fully rendered
			setTimeout(() => {
				process.exit(error ? 1 : 0);
			}, 100);
		}
	}, [loading, result, error]);

	if (loading) return <Text>Loading next task...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;
	if (!result) return <Text color="red">No result available</Text>;

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

	// If no next task available
	if (!result.task) {
		return (
			<Box flexDirection="column">
				<Text bold color="yellow">
					No Next Task Available
				</Text>
				<Text>{result.message}</Text>

				{result.availableTasks.length > 0 && (
					<Box flexDirection="column" marginTop={1}>
						<Text>Available tasks ({result.availableTasks.length}):</Text>
						{result.availableTasks.slice(0, 5).map((task) => (
							<Box key={task.id} marginLeft={2}>
								<Text>
									<Text color="cyan">{task.id}</Text> - {task.title}
									<Text color={getStatusColor(task.status)}>
										{" "}
										[{task.status}]
									</Text>
									<Text color={getPriorityColor(task.priority)}>
										{" "}
										({task.priority})
									</Text>
								</Text>
							</Box>
						))}
						{result.availableTasks.length > 5 && (
							<Box marginLeft={2}>
								<Text color="gray">
									... and {result.availableTasks.length - 5} more
								</Text>
							</Box>
						)}
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

	// Display the next task with full context
	const { task, context } = result;

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
						{task.id}
					</Text>{" "}
					- <Text bold>{task.title}</Text>
				</Text>
				<Text>
					Status: <Text color={getStatusColor(task.status)}>{task.status}</Text>{" "}
					| Priority:{" "}
					<Text color={getPriorityColor(task.priority)}> {task.priority}</Text>
				</Text>

				{task.description && (
					<Box marginTop={1}>
						<Text color="gray">{task.description}</Text>
					</Box>
				)}
			</Box>

			{context && (
				<Box flexDirection="column" marginTop={1}>
					{context.dependencies && context.dependencies.length > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold>Dependencies ({context.dependencies.length}):</Text>
							{context.dependencies.map((dep) => (
								<Box key={dep.id} marginLeft={2}>
									<Text>
										<Text color="green">✅</Text> {dep.id} - {dep.title}
									</Text>
								</Box>
							))}
						</Box>
					)}

					{context.dependents && context.dependents.length > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold>Blocked Tasks ({context.dependents.length}):</Text>
							{context.dependents.slice(0, 3).map((dep) => (
								<Box key={dep.id} marginLeft={2}>
									<Text>
										<Text color="yellow">⏱️</Text> {dep.id} - {dep.title}
									</Text>
								</Box>
							))}
							{context.dependents.length > 3 && (
								<Box marginLeft={2}>
									<Text color="gray">
										... and {context.dependents.length - 3} more
									</Text>
								</Box>
							)}
						</Box>
					)}

					{context.ancestors && context.ancestors.length > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold>Task Hierarchy:</Text>
							{context.ancestors.map((ancestor, index) => (
								<Box key={ancestor.id} marginLeft={index * 2 + 2}>
									<Text color="blue">
										{"└─ ".repeat(index + 1)}
										{ancestor.id} - {ancestor.title}
									</Text>
								</Box>
							))}
							<Box marginLeft={(context.ancestors.length + 1) * 2}>
								<Text bold color="green">
									{"└─ ".repeat(context.ancestors.length + 1)}
									{task.id} - {task.title} (current)
								</Text>
							</Box>
						</Box>
					)}
				</Box>
			)}

			<Box flexDirection="column" marginTop={1}>
				<Text bold color="cyan">
					Suggested Actions:
				</Text>
				<Text color="green">
					• Start working:{" "}
					<Text color="cyan">
						astrotask task update {task.id} --status in-progress
					</Text>
				</Text>
				<Text color="green">
					• View hierarchy:{" "}
					<Text color="cyan">astrotask task tree {task.id}</Text>
				</Text>
				{context?.dependents && context.dependents.length > 0 && (
					<Text color="green">
						• See available tasks:{" "}
						<Text color="cyan">astrotask task available</Text>
					</Text>
				)}
			</Box>

			{result.availableTasks.length > 1 && (
				<Box marginTop={1}>
					<Text color="gray">
						{result.availableTasks.length - 1} other tasks also available to
						work on
					</Text>
				</Box>
			)}
		</Box>
	);
}
