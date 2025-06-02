import type { Task } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase, useTaskService } from "../../context/DatabaseContext.js";

export const description = "Visualize task dependency tree";

export const options = zod.object({
	root: zod.string().optional().describe("Root task ID to start the tree from"),
	depth: zod
		.number()
		.optional()
		.describe("Maximum depth to display (default: unlimited)"),
	hideStatus: zod.boolean().default(false).describe("Hide status indicators"),
	showBlocked: zod.boolean().default(false).describe("Highlight blocked tasks"),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface TaskNode {
	task: Task;
	dependencies: TaskNode[];
	dependents: TaskNode[];
	isBlocked: boolean;
	depth: number;
}

interface DependencyTreeData {
	rootNodes: TaskNode[];
	allTasks: Map<string, Task>;
	dependencyGraph: Map<
		string,
		{ dependencies: string[]; dependents: string[]; isBlocked: boolean }
	>;
}

export default function DependencyTree({ options }: Props) {
	const store = useDatabase();
	const taskService = useTaskService();
	const [treeData, setTreeData] = useState<DependencyTreeData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadDependencyTree() {
			try {
				// Get all tasks
				const allTasks = await store.listTasks();
				const taskMap = new Map(allTasks.map((task) => [task.id, task]));

				// Build dependency graph for all tasks
				const dependencyGraph = new Map<
					string,
					{ dependencies: string[]; dependents: string[]; isBlocked: boolean }
				>();

				for (const task of allTasks) {
					const graph = await taskService.getTaskDependencyGraph(task.id);
					dependencyGraph.set(task.id, graph);
				}

				// If a specific root is requested, start from there
				if (options.root) {
					const rootTask = taskMap.get(options.root);
					if (!rootTask) {
						setError(`Task ${options.root} not found`);
						return;
					}

					const rootNode = buildTaskNode(
						rootTask,
						taskMap,
						dependencyGraph,
						0,
						options.depth,
						new Set(),
					);
					setTreeData({
						rootNodes: [rootNode],
						allTasks: taskMap,
						dependencyGraph,
					});
				} else {
					// Find all root tasks (tasks with no dependencies)
					const rootTasks = allTasks.filter((task) => {
						const graph = dependencyGraph.get(task.id);
						return graph && graph.dependencies.length === 0;
					});

					const rootNodes = rootTasks.map((task) =>
						buildTaskNode(
							task,
							taskMap,
							dependencyGraph,
							0,
							options.depth,
							new Set(),
						),
					);

					setTreeData({
						rootNodes,
						allTasks: taskMap,
						dependencyGraph,
					});
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load dependency tree",
				);
			} finally {
				setLoading(false);
			}
		}
		loadDependencyTree();
	}, [options, store, taskService]);

	if (loading) return <Text>Loading dependency tree...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;
	if (!treeData) return <Text color="red">No tree data available</Text>;

	const getStatusColor = (status: string) => {
		switch (status) {
			case "done":
				return "green";
			case "in-progress":
				return "yellow";
			case "pending":
				return "gray";
			case "cancelled":
				return "red";
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
			case "cancelled":
				return "❌";
			default:
				return "❓";
		}
	};

	const renderTaskNode = (
		node: TaskNode,
		prefix: string = "",
		isLast: boolean = true,
	): JSX.Element[] => {
		const elements: JSX.Element[] = [];
		const connector = isLast ? "└── " : "├── ";
		const nextPrefix = prefix + (isLast ? "    " : "│   ");

		// Task line
		const taskLine = (
			<Box key={`task-${node.task.id}`}>
				<Text color="gray">
					{prefix}
					{connector}
				</Text>
				{!options.hideStatus && <Text>{getStatusIcon(node.task.status)} </Text>}
				<Text color="cyan">{node.task.id}</Text>
				<Text> - {node.task.title}</Text>
				{!options.hideStatus && (
					<Text color={getStatusColor(node.task.status)}>
						{" "}
						[{node.task.status}]
					</Text>
				)}
				<Text color="magenta"> [{node.task.priority}]</Text>
				{options.showBlocked && node.isBlocked && (
					<Text color="red" bold>
						{" "}
						🚫 BLOCKED
					</Text>
				)}
			</Box>
		);
		elements.push(taskLine);

		// Render dependents (tasks that depend on this one)
		if (node.dependents.length > 0) {
			node.dependents.forEach((dependent, index) => {
				const isLastDependent = index === node.dependents.length - 1;
				elements.push(
					...renderTaskNode(dependent, nextPrefix, isLastDependent),
				);
			});
		}

		return elements;
	};

	return (
		<Box flexDirection="column">
			<Text bold>
				{options.root ? (
					<>
						Dependency Tree for Task: <Text color="cyan">{options.root}</Text>
					</>
				) : (
					"Complete Dependency Tree"
				)}
			</Text>

			{options.depth && (
				<Text color="gray">Maximum depth: {options.depth}</Text>
			)}

			{treeData.rootNodes.length === 0 ? (
				<Box marginTop={1}>
					<Text color="yellow">
						No root tasks found (all tasks have dependencies)
					</Text>
				</Box>
			) : (
				<Box flexDirection="column" marginTop={1}>
					{treeData.rootNodes.map((rootNode, index) => {
						const isLast = index === treeData.rootNodes.length - 1;
						return (
							<Box key={rootNode.task.id} flexDirection="column">
								{renderTaskNode(rootNode, "", isLast)}
							</Box>
						);
					})}
				</Box>
			)}

			<Box marginTop={1}>
				<Text color="gray">
					💡 Tip: Use --root to focus on a specific task's dependency tree
				</Text>
			</Box>
		</Box>
	);
}

function buildTaskNode(
	task: Task,
	taskMap: Map<string, Task>,
	dependencyGraph: Map<
		string,
		{ dependencies: string[]; dependents: string[]; isBlocked: boolean }
	>,
	currentDepth: number,
	maxDepth: number | undefined,
	visited: Set<string>,
): TaskNode {
	// Prevent infinite loops
	if (visited.has(task.id)) {
		return {
			task,
			dependencies: [],
			dependents: [],
			isBlocked: false,
			depth: currentDepth,
		};
	}

	// Stop if we've reached max depth
	if (maxDepth !== undefined && currentDepth >= maxDepth) {
		return {
			task,
			dependencies: [],
			dependents: [],
			isBlocked: false,
			depth: currentDepth,
		};
	}

	visited.add(task.id);
	const graph = dependencyGraph.get(task.id);

	if (!graph) {
		return {
			task,
			dependencies: [],
			dependents: [],
			isBlocked: false,
			depth: currentDepth,
		};
	}

	// Build dependent nodes (tasks that depend on this one)
	const dependents = graph.dependents
		.map((id) => taskMap.get(id))
		.filter((t): t is Task => t !== null)
		.map((dependentTask) =>
			buildTaskNode(
				dependentTask,
				taskMap,
				dependencyGraph,
				currentDepth + 1,
				maxDepth,
				new Set(visited),
			),
		);

	// Build dependency nodes (tasks this one depends on)
	const dependencies = graph.dependencies
		.map((id) => taskMap.get(id))
		.filter((t): t is Task => t !== null)
		.map((dependencyTask) =>
			buildTaskNode(
				dependencyTask,
				taskMap,
				dependencyGraph,
				currentDepth + 1,
				maxDepth,
				new Set(visited),
			),
		);

	visited.delete(task.id);

	return {
		task,
		dependencies,
		dependents,
		isBlocked: graph.isBlocked,
		depth: currentDepth,
	};
}
