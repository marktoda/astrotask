import type { ContextSlice, Task, TaskTree } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase, useTaskService } from "../../context/DatabaseContext.js";

export const description =
	"Get a specific task by ID with full context information, similar to next task but for a specific task";

export const options = zod.object({
	id: zod
		.string()
		.describe("Task ID to retrieve. The task must exist in the system."),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface GetTaskResult {
	task: Task | null;
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

export default function Get({ options }: Props) {
	const store = useDatabase();
	const taskService = useTaskService();
	const [result, setResult] = useState<GetTaskResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function getTask() {
			try {
				// Get the task by ID
				const task = await store.getTask(options.id);
				
				if (!task) {
					setResult({
						task: null,
						message: `Task with ID ${options.id} not found`,
					});
					return;
				}

				// Get full context for the task
				const taskWithContext = await taskService.getTaskWithContext(task.id);
				let context = undefined;

				if (taskWithContext) {
					const contextSlices = await store.listContextSlices(task.id);

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

				setResult({
					task,
					message: `Found task: ${task.title}`,
					context,
				});
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to get task",
				);
			} finally {
				setLoading(false);
			}
		}
		getTask();
	}, [options.id, taskService, store]);

	// Exit the process after operation is complete (like expand command)
	useEffect(() => {
		if (!loading && (result || error)) {
			// Use setTimeout to ensure the component has fully rendered
			setTimeout(() => {
				process.exit(error ? 1 : 0);
			}, 100);
		}
	}, [loading, result, error]);

	if (loading) return <Text>Loading task {options.id}...</Text>;
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
			case "blocked":
				return "red";
			case "cancelled":
				return "magenta";
			case "archived":
				return "blue";
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

	// If task not found
	if (!result.task) {
		return (
			<Box flexDirection="column">
				<Text bold color="red">
					Task Not Found
				</Text>
				<Text>{result.message}</Text>
			</Box>
		);
	}

	const task = result.task;
	const context = result.context;

	return (
		<Box flexDirection="column">
			{/* Task Header */}
			<Box flexDirection="column" marginBottom={1}>
				<Text bold color="cyan">
					Task: {task.id}
				</Text>
				<Text bold>{task.title}</Text>
				<Box>
					<Text color={getStatusColor(task.status)}>
						Status: {task.status}
					</Text>
					<Text> | </Text>
					<Text color={getPriorityColor(task.priority)}>
						Priority: {task.priority}
					</Text>
				</Box>
				{task.description && (
					<Box marginTop={1}>
						<Text color="gray">Description: {task.description}</Text>
					</Box>
				)}
			</Box>

			{/* Context Information */}
			{context && (
				<Box flexDirection="column">
					{/* Ancestors */}
					{context.ancestors.length > 0 && (
						<Box flexDirection="column" marginBottom={1}>
							<Text bold color="blue">
								Ancestors ({context.ancestors.length}):
							</Text>
							{context.ancestors.map((ancestor) => (
								<Box key={ancestor.id} marginLeft={2}>
									<Text>
										<Text color="cyan">{ancestor.id}</Text> - {ancestor.title}
										<Text color={getStatusColor(ancestor.status)}>
											{" "}
											[{ancestor.status}]
										</Text>
									</Text>
								</Box>
							))}
						</Box>
					)}

					{/* Dependencies */}
					{context.dependencies.length > 0 && (
						<Box flexDirection="column" marginBottom={1}>
							<Text bold color="yellow">
								Dependencies ({context.dependencies.length}):
							</Text>
							{context.dependencies.map((dep) => (
								<Box key={dep.id} marginLeft={2}>
									<Text>
										<Text color="cyan">{dep.id}</Text> - {dep.title}
										<Text color={getStatusColor(dep.status)}>
											{" "}
											[{dep.status}]
										</Text>
									</Text>
								</Box>
							))}
						</Box>
					)}

					{/* Dependents */}
					{context.dependents.length > 0 && (
						<Box flexDirection="column" marginBottom={1}>
							<Text bold color="magenta">
								Dependents ({context.dependents.length}):
							</Text>
							{context.dependents.map((dep) => (
								<Box key={dep.id} marginLeft={2}>
									<Text>
										<Text color="cyan">{dep.id}</Text> - {dep.title}
										<Text color={getStatusColor(dep.status)}>
											{" "}
											[{dep.status}]
										</Text>
									</Text>
								</Box>
							))}
						</Box>
					)}

					{/* Blocked Status */}
					{context.isBlocked && (
						<Box flexDirection="column" marginBottom={1}>
							<Text bold color="red">
								⚠️ Task is blocked by:
							</Text>
							{context.blockedBy.map((blocker) => (
								<Box key={blocker.id} marginLeft={2}>
									<Text>
										<Text color="cyan">{blocker.id}</Text> - {blocker.title}
										<Text color={getStatusColor(blocker.status)}>
											{" "}
											[{blocker.status}]
										</Text>
									</Text>
								</Box>
							))}
						</Box>
					)}

					{/* Context Slices */}
					{context.contextSlices.length > 0 && (
						<Box flexDirection="column" marginBottom={1}>
							<Text bold color="green">
								Context ({context.contextSlices.length}):
							</Text>
							{context.contextSlices.map((slice) => (
								<Box key={slice.id} flexDirection="column" marginLeft={2} marginBottom={1}>
									<Text bold color="white">
										{slice.title}
									</Text>
									<Text color="gray">
										{slice.description}
									</Text>
								</Box>
							))}
						</Box>
					)}

					{/* Descendants */}
					{context.descendants.length > 0 && (
						<Box flexDirection="column" marginBottom={1}>
							<Text bold color="green">
								Subtasks ({context.descendants.length}):
							</Text>
							{context.descendants.slice(0, 10).map((tree) => (
								<Box key={tree.task.id} marginLeft={2}>
									<Text>
										<Text color="cyan">{tree.task.id}</Text> - {tree.task.title}
										<Text color={getStatusColor(tree.task.status)}>
											{" "}
											[{tree.task.status}]
										</Text>
									</Text>
								</Box>
							))}
							{context.descendants.length > 10 && (
								<Box marginLeft={2}>
									<Text color="gray">
										... and {context.descendants.length - 10} more subtasks
									</Text>
								</Box>
							)}
						</Box>
					)}
				</Box>
			)}

			{/* Summary */}
			<Box marginTop={1}>
				<Text color="gray">
					Created: {new Date(task.createdAt).toLocaleString()}
				</Text>
				{task.updatedAt !== task.createdAt && (
					<Text color="gray">
						{" "}
						| Updated: {new Date(task.updatedAt).toLocaleString()}
					</Text>
				)}
			</Box>
		</Box>
	);
} 