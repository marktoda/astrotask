import type { NextTaskFilter, TrackingTaskTree } from "@astrotask/core";
import { priorityScore, taskStatus } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useAstrotask } from "../../context/DatabaseContext.js";
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
			"Root task ID - limit search to subtasks of this task. Use this to focus on a specific project or feature area.",
		),
	includeInProgress: zod
		.boolean()
		.default(false)
		.describe("Include tasks that are already in progress"),
});

type Props = {
	options: zod.infer<typeof options>;
};

// Enhanced result type with tree context
interface NextTaskDisplay {
	task: TrackingTaskTree | null;
	message: string;
	availableCount: number;
	blockedCount: number;
	context: {
		hasSubtasks: boolean;
		availableSubtasks: number;
		isBlocked: boolean;
		blockingTasks: string[];
		canStartWork: boolean;
	} | null;
}

export default function Next({ options }: Props) {
	const astrotask = useAstrotask();
	const [display, setDisplay] = useState<NextTaskDisplay | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function getNextTask() {
			try {
				// NEW TREE API: Much simpler and more powerful
				const filter: NextTaskFilter = {
					status: options.status,
					priorityScore: options.priorityScore,
					parentId: options.root,
					includeInProgress: options.includeInProgress,
				};

				// Get the next available task using the new tree-centric API
				const nextTask = await astrotask.getNextTask(filter);

				// Get all available tasks for context
				const allAvailable = await astrotask.getAvailableTasks(filter);
				const availableCount = allAvailable.length;
				const blockedCount = allAvailable.filter((t) => t.isBlocked()).length;

				let message: string;
				let context: NextTaskDisplay["context"] = null;

				if (nextTask) {
					message = `Next recommended task: ${nextTask.title}`;
					context = {
						hasSubtasks: nextTask.getChildren().length > 0,
						availableSubtasks: nextTask.getAvailableChildren().length,
						isBlocked: nextTask.isBlocked(),
						blockingTasks: nextTask.getBlockingTasks(),
						canStartWork: nextTask.canStart(),
					};
				} else {
					message =
						availableCount > 0
							? "No unblocked tasks available (all available tasks are blocked by dependencies)"
							: options.root
								? `No tasks available under root ${options.root}`
								: "No tasks available with current filters";
				}

				setDisplay({
					task: nextTask,
					message,
					availableCount,
					blockedCount,
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
	}, [options, astrotask]);

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
	if (!display.task) {
		return (
			<Box flexDirection="column">
				<Text bold color="yellow">
					No Next Task Available
				</Text>
				<Text>{display.message}</Text>

				<Box flexDirection="column" marginTop={1}>
					<Text>
						📊 Task Overview: {display.availableCount} available,{" "}
						{display.blockedCount} blocked
					</Text>

					{display.blockedCount > 0 && (
						<Text color="red">
							🚫 {display.blockedCount} task(s) are blocked by incomplete
							dependencies
						</Text>
					)}
				</Box>

				<Box marginTop={1}>
					<Text color="green">
						💡 Try: <Text color="cyan">astrotask task available</Text> to see
						all available tasks
						{options.root && (
							<>
								{" "}
								or <Text color="cyan">astrotask task tree {options.root}</Text>{" "}
								to see the full task hierarchy
							</>
						)}
					</Text>
				</Box>
			</Box>
		);
	}

	const task = display.task.task;
	const context = display.context!;

	// Display the next task with enhanced context
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="green"
			padding={1}
		>
			<Text bold color="green">
				🎯 Next Recommended Task
				{options.root ? ` (under ${options.root})` : ""}
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
					<Text color="magenta">
						{formatPriority(task.priorityScore ?? 50)}
					</Text>
				</Text>

				{task.description && (
					<Box marginTop={1}>
						<Text color="gray">📝 {task.description}</Text>
					</Box>
				)}
			</Box>

			{/* Enhanced context information */}
			<Box flexDirection="column" marginTop={1}>
				<Text bold color="blue">
					Task Context:
				</Text>

				{context.hasSubtasks && (
					<Text>
						🌳 Has {display.task.getChildren().length} subtask(s)
						{context.availableSubtasks > 0 && (
							<Text color="green">
								{" "}
								({context.availableSubtasks} available)
							</Text>
						)}
					</Text>
				)}

				{context.isBlocked ? (
					<Text color="red">
						🚫 Currently blocked by: {context.blockingTasks.join(", ")}
					</Text>
				) : (
					<Text color="green">
						✅ Ready to start - no blocking dependencies
					</Text>
				)}

				<Text>
					📊 Workflow: {display.availableCount} available tasks in scope
				</Text>
			</Box>

			{/* Smart action suggestions */}
			<Box flexDirection="column" marginTop={1}>
				<Text bold color="cyan">
					Recommended Actions:
				</Text>

				{context.canStartWork && (
					<Text color="green">
						▶️ <Text color="cyan">astrotask task start-work {task.id}</Text> -
						Start working on this task
					</Text>
				)}

				{context.availableSubtasks > 0 && (
					<Text color="yellow">
						🔍 <Text color="cyan">astrotask task tree {task.id}</Text> - View
						available subtasks
					</Text>
				)}

				<Text color="blue">
					📋 <Text color="cyan">astrotask task context {task.id}</Text> - See
					full task context and dependencies
				</Text>
			</Box>

			<Box marginTop={1}>
				<Text color="gray" italic>
					💡 Enhanced with Tree API: Smart task selection with dependency
					awareness
				</Text>
			</Box>
		</Box>
	);
}
