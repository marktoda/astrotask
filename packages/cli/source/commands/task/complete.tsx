import type { TrackingTaskTree } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useAstrotask } from "../../context/DatabaseContext.js";

export const description =
	"Complete a task and automatically handle workflow transitions (NEW TREE API) - mark as done, unblock dependents, and optionally start next available tasks";

export const options = zod.object({
	taskId: zod.string().describe("Task ID to mark as complete"),
	cascade: zod
		.boolean()
		.default(false)
		.describe("Mark all subtasks as complete as well"),
	autoStart: zod
		.boolean()
		.default(true)
		.describe(
			"Automatically start available child tasks or next tasks in sequence",
		),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface CompleteResult {
	success: boolean;
	task?: TrackingTaskTree;
	message: string;
	cascadedTasks?: string[];
	autoStartedTasks?: TrackingTaskTree[];
	unblockedTasks?: string[];
	nextRecommendations?: TrackingTaskTree[];
	warnings?: string[];
}

export default function Complete({ options }: Props) {
	const astrotask = useAstrotask();
	const [result, setResult] = useState<CompleteResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function completeTask() {
			try {
				// Get the task tree
				const rootTree = await astrotask.tasks();
				const taskNode = rootTree.find((task) => task.id === options.taskId);

				if (!taskNode) {
					setResult({
						success: false,
						message: `Task ${options.taskId} not found`,
					});
					return;
				}

				// Check if task is already completed
				if (taskNode.status === "done") {
					setResult({
						success: false,
						task: taskNode,
						message: `Task is already marked as complete`,
					});
					return;
				}

				const warnings: string[] = [];
				const cascadedTasks: string[] = [];
				let autoStartedTasks: TrackingTaskTree[] = [];

				// Get dependency graph to find dependents that will be unblocked
				const dependencyGraph = await astrotask.dependencies();
				const dependents = dependencyGraph.getDependents(options.taskId);

				// Mark task as complete (with optional cascading)
				if (options.cascade) {
					// Get all descendants before marking as done
					const descendants = taskNode.getAllDescendants();
					taskNode.markDone(true); // Cascade to all descendants
					cascadedTasks.push(...descendants.map((d) => d.id));
				} else {
					// Check if task has incomplete subtasks
					const incompleteChildren = taskNode
						.getChildren()
						.filter(
							(child) =>
								child.status !== "done" &&
								child.status !== "cancelled" &&
								child.status !== "archived",
						);

					if (incompleteChildren.length > 0 && !options.cascade) {
						warnings.push(
							`⚠️  Task has ${incompleteChildren.length} incomplete subtask(s). Consider using --cascade to complete them all.`,
						);
					}

					taskNode.markDone(false);
				}

				// Auto-start logic if enabled
				if (options.autoStart) {
					// Strategy 1: Start available children of this task
					const availableChildren = taskNode.getAvailableChildren();
					for (const child of availableChildren) {
						if (child.startWork()) {
							autoStartedTasks.push(child);
						}
					}

					// Strategy 2: If no children were started, look for next tasks at the same level
					if (autoStartedTasks.length === 0) {
						const parent = taskNode.getParent();
						if (parent) {
							const nextAvailable = parent.getNextAvailableTask();
							if (
								nextAvailable &&
								nextAvailable.id !== taskNode.id &&
								nextAvailable.startWork()
							) {
								autoStartedTasks.push(nextAvailable);
							}
						} else {
							// Look for next available task at root level
							const nextAvailable = rootTree.getNextAvailableTask();
							if (
								nextAvailable &&
								nextAvailable.id !== taskNode.id &&
								nextAvailable.startWork()
							) {
								autoStartedTasks.push(nextAvailable);
							}
						}
					}
				}

				// Flush all changes
				await astrotask.flushTree(rootTree);

				// Get tasks that were unblocked by completing this task
				const unblockedTasks: string[] = [];
				for (const dependentId of dependents) {
					const dependentNode = rootTree.find((t) => t.id === dependentId);
					if (dependentNode && !dependentNode.isBlocked()) {
						unblockedTasks.push(dependentId);
					}
				}

				// Get next recommendations (tasks that are now available to work on)
				const availableTasks = await astrotask.getAvailableTasks();
				const nextRecommendations = availableTasks
					.filter((t) => t.status === "pending")
					.slice(0, 3); // Top 3 recommendations

				setResult({
					success: true,
					task: taskNode,
					message: `Successfully completed "${taskNode.title}"`,
					cascadedTasks: cascadedTasks.length > 0 ? cascadedTasks : undefined,
					autoStartedTasks:
						autoStartedTasks.length > 0 ? autoStartedTasks : undefined,
					unblockedTasks:
						unblockedTasks.length > 0 ? unblockedTasks : undefined,
					nextRecommendations:
						nextRecommendations.length > 0 ? nextRecommendations : undefined,
					warnings: warnings.length > 0 ? warnings : undefined,
				});
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to complete task",
				);
			} finally {
				setLoading(false);
			}
		}
		completeTask();
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
		return <Text>🔄 Completing task {options.taskId}...</Text>;
	}

	if (error) {
		return <Text color="red">❌ Error: {error}</Text>;
	}

	if (!result) {
		return <Text color="red">❌ No result available</Text>;
	}

	// Failure case
	if (!result.success) {
		return (
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="red"
				padding={1}
			>
				<Text bold color="red">
					❌ Could Not Complete Task
				</Text>
				<Box marginTop={1}>
					<Text>{result.message}</Text>
				</Box>

				{result.task && (
					<Box marginTop={1}>
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
			</Box>
		);
	}

	// Success case
	const task = result.task!.task;

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="green"
			padding={1}
		>
			<Text bold color="green">
				✅ Task Completed Successfully
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
					<Text color="green" bold>
						done
					</Text>{" "}
					| Priority: <Text color="magenta">{task.priorityScore ?? 50}</Text>
				</Text>
			</Box>

			{/* Show cascade results */}
			{result.cascadedTasks && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="green">
						🌊 Cascaded Completion:
					</Text>
					<Text>Also completed {result.cascadedTasks.length} subtask(s)</Text>
				</Box>
			)}

			{/* Show auto-started tasks */}
			{result.autoStartedTasks && result.autoStartedTasks.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="blue">
						🚀 Auto-Started Tasks:
					</Text>
					{result.autoStartedTasks.map((autoTask) => (
						<Box key={autoTask.id} marginLeft={2}>
							<Text color="blue">
								▶️ {autoTask.id} - {autoTask.title}
							</Text>
						</Box>
					))}
				</Box>
			)}

			{/* Show unblocked tasks */}
			{result.unblockedTasks && result.unblockedTasks.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="yellow">
						🔓 Unblocked Tasks:
					</Text>
					<Text>
						Completing this task unblocked {result.unblockedTasks.length}{" "}
						dependent task(s):
					</Text>
					{result.unblockedTasks.map((taskId) => (
						<Box key={taskId} marginLeft={2}>
							<Text color="yellow">• {taskId}</Text>
						</Box>
					))}
				</Box>
			)}

			{/* Show next recommendations */}
			{result.nextRecommendations && result.nextRecommendations.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="cyan">
						🎯 Next Recommended Tasks:
					</Text>
					{result.nextRecommendations.map((nextTask, index) => (
						<Box key={nextTask.id} marginLeft={2}>
							<Text color="cyan">
								{index + 1}. {nextTask.id} - {nextTask.title} [
								{nextTask.task.priorityScore}]
							</Text>
						</Box>
					))}
				</Box>
			)}

			{/* Show warnings */}
			{result.warnings && result.warnings.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					{result.warnings.map((warning, index) => (
						<Text key={index} color="yellow">
							{warning}
						</Text>
					))}
				</Box>
			)}

			{/* Show workflow actions */}
			<Box flexDirection="column" marginTop={1}>
				<Text bold color="blue">
					Workflow Actions:
				</Text>

				{result.autoStartedTasks && result.autoStartedTasks.length > 0 ? (
					<Text color="green">
						✨ Continue working on auto-started task(s) above
					</Text>
				) : (
					<Text color="blue">
						🎯 <Text color="cyan">astrotask task next</Text> - Find your next
						task
					</Text>
				)}

				<Text color="blue">
					📊 <Text color="cyan">astrotask task available</Text> - See all
					available tasks
				</Text>

				{result.unblockedTasks && result.unblockedTasks.length > 0 && (
					<Text color="yellow">
						🔍{" "}
						<Text color="cyan">
							astrotask task dependencies --show-unblocked
						</Text>{" "}
						- Review newly unblocked tasks
					</Text>
				)}
			</Box>

			<Box marginTop={1}>
				<Text color="gray" italic>
					🎉 Great work! Task completion triggered intelligent workflow
					automation.
				</Text>
			</Box>
		</Box>
	);
}
