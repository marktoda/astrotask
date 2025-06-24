import type { TrackingTaskTree } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useAstrotask } from "../../context/DatabaseContext.js";

export const description =
	"Intelligently start work on a task (NEW TREE API) - checks dependencies, starts work, and auto-starts available child tasks";

export const options = zod.object({
	taskId: zod.string().describe("Task ID to start working on"),
	cascade: zod
		.boolean()
		.default(false)
		.describe(
			"Automatically start available child tasks when this task is completed",
		),
	force: zod
		.boolean()
		.default(false)
		.describe("Force start even if task has blocking dependencies"),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface StartWorkResult {
	success: boolean;
	task?: TrackingTaskTree;
	message: string;
	blockedBy?: string[];
	autoStartedTasks?: TrackingTaskTree[];
	warnings?: string[];
}

export default function StartWork({ options }: Props) {
	const astrotask = useAstrotask();
	const [result, setResult] = useState<StartWorkResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function startWorkOnTask() {
			try {
				// Get the task tree to work with
				const rootTree = await astrotask.tasks();
				const taskNode = rootTree.find((task) => task.id === options.taskId);

				if (!taskNode) {
					setResult({
						success: false,
						message: `Task ${options.taskId} not found`,
					});
					return;
				}

				// Check if task is blocked
				if (taskNode.isBlocked() && !options.force) {
					const blockingTasks = taskNode.getBlockingTasks();
					setResult({
						success: false,
						task: taskNode,
						message: `Cannot start task - blocked by incomplete dependencies`,
						blockedBy: blockingTasks,
					});
					return;
				}

				// Attempt to start work
				const started = taskNode.startWork();
				if (!started && !options.force) {
					setResult({
						success: false,
						task: taskNode,
						message: `Task is not in a startable state (current status: ${taskNode.status})`,
					});
					return;
				}

				// Force start if requested
				if (options.force && !started) {
					taskNode.markInProgress();
				}

				// Flush changes to persist the status update
				await astrotask.flushTree(taskNode);

				// Prepare success result
				const warnings: string[] = [];
				if (options.force && taskNode.isBlocked()) {
					warnings.push(
						"⚠️  Task was started despite having blocking dependencies",
					);
				}

				setResult({
					success: true,
					task: taskNode,
					message: `Successfully started work on "${taskNode.title}"`,
					warnings,
				});
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to start work on task",
				);
			} finally {
				setLoading(false);
			}
		}
		startWorkOnTask();
	}, [options, astrotask]);

	// Exit the process after operation is complete
	useEffect(() => {
		if (!loading && (result || error)) {
			setTimeout(() => {
				process.exit(error || !result?.success ? 1 : 0);
			}, 100);
		}
	}, [loading, result, error]);

	if (loading) {
		return <Text>🔄 Starting work on task {options.taskId}...</Text>;
	}

	if (error) {
		return <Text color="red">❌ Error: {error}</Text>;
	}

	if (!result) {
		return <Text color="red">❌ No result available</Text>;
	}

	// Success case
	if (result.success && result.task) {
		const task = result.task.task;

		return (
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="green"
				padding={1}
			>
				<Text bold color="green">
					✅ Work Started Successfully
				</Text>

				<Box flexDirection="column" marginTop={1}>
					<Text>
						<Text color="cyan" bold>
							{task.id}
						</Text>{" "}
						- <Text bold>{task.title}</Text>
					</Text>
					<Text>
						Status:{" "}
						<Text color="yellow" bold>
							in-progress
						</Text>{" "}
						| Priority: <Text color="magenta">{task.priorityScore ?? 50}</Text>
					</Text>

					{task.description && (
						<Box marginTop={1}>
							<Text color="gray">📝 {task.description}</Text>
						</Box>
					)}
				</Box>

				{/* Show warnings if any */}
				{result.warnings && result.warnings.length > 0 && (
					<Box flexDirection="column" marginTop={1}>
						{result.warnings.map((warning, index) => (
							<Text key={index} color="yellow">
								{warning}
							</Text>
						))}
					</Box>
				)}

				{/* Show available next actions */}
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="blue">
						Next Actions:
					</Text>

					{result.task.getAvailableChildren().length > 0 && (
						<Text color="green">
							🎯{" "}
							<Text color="cyan">
								astrotask task available --parent {task.id}
							</Text>{" "}
							- See available subtasks
						</Text>
					)}

					<Text color="blue">
						✅ <Text color="cyan">astrotask task complete {task.id}</Text> -
						Mark task as done when finished
					</Text>

					<Text color="blue">
						📊 <Text color="cyan">astrotask task context {task.id}</Text> - View
						full task context
					</Text>
				</Box>

				{/* Show workflow context */}
				<Box marginTop={1}>
					<Text color="gray" italic>
						💡 Task is now in progress. Use 'astrotask task next' to find your
						next task after completing this one.
					</Text>
				</Box>
			</Box>
		);
	}

	// Failure case
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="red"
			padding={1}
		>
			<Text bold color="red">
				❌ Could Not Start Work
			</Text>

			<Box marginTop={1}>
				<Text>{result.message}</Text>
			</Box>

			{result.task && (
				<Box flexDirection="column" marginTop={1}>
					<Text>
						<Text color="cyan">{result.task.task.id}</Text> -{" "}
						<Text bold>{result.task.task.title}</Text>
					</Text>
					<Text>
						Current Status:{" "}
						<Text color="yellow">{result.task.task.status}</Text>
					</Text>
				</Box>
			)}

			{/* Show blocking dependencies */}
			{result.blockedBy && result.blockedBy.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="red">
						🚫 Blocked by:
					</Text>
					{result.blockedBy.map((blockingTaskId) => (
						<Box key={blockingTaskId} marginLeft={2}>
							<Text color="red">• {blockingTaskId}</Text>
						</Box>
					))}
				</Box>
			)}

			{/* Show suggested actions */}
			<Box flexDirection="column" marginTop={1}>
				<Text bold color="blue">
					Suggested Actions:
				</Text>

				{result.blockedBy && result.blockedBy.length > 0 && (
					<>
						<Text color="yellow">🔧 Complete blocking dependencies first</Text>
						<Text color="blue">
							📋{" "}
							<Text color="cyan">
								astrotask task dependencies {options.taskId}
							</Text>{" "}
							- View dependency details
						</Text>
					</>
				)}

				{options.force ? null : (
					<Text color="red">
						⚡{" "}
						<Text color="cyan">
							astrotask task start-work {options.taskId} --force
						</Text>{" "}
						- Force start despite dependencies
					</Text>
				)}

				<Text color="blue">
					🎯 <Text color="cyan">astrotask task next</Text> - Find another
					available task to work on
				</Text>
			</Box>
		</Box>
	);
}
