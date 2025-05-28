import type { Task } from "@astrolabe/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase, useTaskService } from "../../context/DatabaseContext.js";

export const description = "View dependencies and dependents for a task";

export const options = zod.object({
	taskId: zod.string().describe("Task ID to view dependencies for"),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface DependencyInfo {
	task: Task;
	dependencies: Task[];
	dependents: Task[];
	isBlocked: boolean;
	blockedBy: Task[];
}

export default function Dependencies({ options }: Props) {
	const store = useDatabase();
	const taskService = useTaskService();
	const [info, setInfo] = useState<DependencyInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadDependencyInfo() {
			try {
				// Get the task
				const task = await store.getTask(options.taskId);
				if (!task) {
					setError(`Task ${options.taskId} not found`);
					return;
				}

				// Get dependency graph
				const dependencyGraph = await taskService.getTaskDependencyGraph(
					options.taskId,
				);

				// Get actual task objects for dependencies and dependents
				const [dependencies, dependents, blockedBy] = await Promise.all([
					Promise.all(
						dependencyGraph.dependencies.map((id) => store.getTask(id)),
					),
					Promise.all(
						dependencyGraph.dependents.map((id) => store.getTask(id)),
					),
					Promise.all(dependencyGraph.blockedBy.map((id) => store.getTask(id))),
				]);

				setInfo({
					task,
					dependencies: dependencies.filter((t): t is Task => t !== null),
					dependents: dependents.filter((t): t is Task => t !== null),
					isBlocked: dependencyGraph.isBlocked,
					blockedBy: blockedBy.filter((t): t is Task => t !== null),
				});
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to load dependency information",
				);
			} finally {
				setLoading(false);
			}
		}
		loadDependencyInfo();
	}, [options.taskId, store, taskService]);

	if (loading) return <Text>Loading dependency information...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;
	if (!info) return <Text color="red">No information available</Text>;

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

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "done":
				return "✅";
			case "in-progress":
				return "🔄";
			case "pending":
				return "⏳";
			default:
				return "❓";
		}
	};

	return (
		<Box flexDirection="column">
			<Text bold>
				Task Dependencies: <Text color="cyan">{info.task.id}</Text> -{" "}
				{info.task.title}
			</Text>

			{info.isBlocked && (
				<Box marginTop={1}>
					<Text color="red" bold>
						⚠️ This task is blocked!
					</Text>
				</Box>
			)}

			{info.dependencies.length > 0 ? (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="yellow">
						Dependencies (tasks this depends on):
					</Text>
					{info.dependencies.map((dep) => (
						<Box key={dep.id} marginLeft={2}>
							<Text>
								{getStatusIcon(dep.status)} <Text color="cyan">{dep.id}</Text> -{" "}
								{dep.title}
								<Text color={getStatusColor(dep.status)}> [{dep.status}]</Text>
								<Text color="magenta"> [{dep.priority}]</Text>
							</Text>
						</Box>
					))}
				</Box>
			) : (
				<Box marginTop={1}>
					<Text color="green">
						✅ No dependencies - this task can be started anytime
					</Text>
				</Box>
			)}

			{info.blockedBy.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="red">
						Blocked by:
					</Text>
					{info.blockedBy.map((blocker) => (
						<Box key={blocker.id} marginLeft={2}>
							<Text>
								❌ <Text color="cyan">{blocker.id}</Text> - {blocker.title}
								<Text color={getStatusColor(blocker.status)}>
									{" "}
									[{blocker.status}]
								</Text>
							</Text>
						</Box>
					))}
				</Box>
			)}

			{info.dependents.length > 0 ? (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="blue">
						Dependents (tasks that depend on this):
					</Text>
					{info.dependents.map((dependent) => (
						<Box key={dependent.id} marginLeft={2}>
							<Text>
								{getStatusIcon(dependent.status)}{" "}
								<Text color="cyan">{dependent.id}</Text> - {dependent.title}
								<Text color={getStatusColor(dependent.status)}>
									{" "}
									[{dependent.status}]
								</Text>
								<Text color="magenta"> [{dependent.priority}]</Text>
							</Text>
						</Box>
					))}
				</Box>
			) : (
				<Box marginTop={1}>
					<Text color="gray">No tasks depend on this one</Text>
				</Box>
			)}
		</Box>
	);
}
