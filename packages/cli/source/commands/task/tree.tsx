import { TaskService, type TaskTree } from "@astrolabe/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description = "Visualize task hierarchy as an interactive tree";

export const options = zod.object({
	root: zod.string().optional().describe("Root task ID to start the tree from"),
	depth: zod
		.number()
		.optional()
		.describe("Maximum depth to display (default: unlimited)"),
	hideStatus: zod.boolean().default(false).describe("Hide status indicators"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Tree({ options }: Props) {
	const db = useDatabase();
	const [tree, setTree] = useState<TaskTree[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const showStatus = !options.hideStatus;
	const maxDepth = options.depth;
	const rootId = options.root;

	useEffect(() => {
		async function loadTree() {
			try {
				const taskService = new TaskService(db);

				if (rootId) {
					// Get specific task and its subtree using TaskTree class
					const rootTree = await taskService.getTaskTreeClass(rootId, maxDepth);
					if (!rootTree) {
						throw new Error(`Task with ID "${rootId}" not found`);
					}
					setTree([rootTree]);
				} else {
					// Get all root tasks (tasks without parents) as TaskTree instances
					const allTasks = await db.listTasks();
					const rootTasks = allTasks.filter((task) => !task.parentId);

					// Use batch loading for efficiency
					const rootTrees = await taskService.getTaskTrees(
						rootTasks.map((task) => task.id),
						maxDepth,
					);
					setTree(rootTrees);
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load task tree",
				);
			} finally {
				setLoading(false);
			}
		}
		loadTree();
	}, [db, rootId, maxDepth]);

	if (loading) return <Text>Loading task tree...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;

	if (tree.length === 0) {
		return (
			<Box flexDirection="column">
				<Text>No tasks found.</Text>
				<Text>
					Use <Text color="cyan">astrolabe task add --title="Task name"</Text>{" "}
					to create your first task.
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				🌳 Task Tree {rootId ? `(from ${rootId})` : "(All Tasks)"}
				{maxDepth !== undefined && (
					<Text color="gray"> (max depth: {maxDepth})</Text>
				)}
			</Text>
			<Text> </Text>
			{tree.map((node, index) => (
				<TreeNodeComponent
					key={node.task.id}
					node={node}
					isLast={index === tree.length - 1}
					depth={0}
					maxDepth={maxDepth}
					showStatus={showStatus}
					prefix=""
				/>
			))}

			{/* Legend */}
			{showStatus && (
				<>
					<Text> </Text>
					<Box flexDirection="column">
						<Text color="gray" bold>
							Legend:
						</Text>
						<Text color="gray">
							⏳ Pending 🔄 In Progress ✅ Done ❌ Cancelled
						</Text>
					</Box>
				</>
			)}
		</Box>
	);
}

interface TreeNodeComponentProps {
	node: TaskTree;
	isLast: boolean;
	depth: number;
	maxDepth?: number;
	showStatus: boolean;
	prefix: string;
}

function TreeNodeComponent({
	node,
	isLast,
	depth,
	maxDepth,
	showStatus,
	prefix,
}: TreeNodeComponentProps) {
	const shouldShowChildren = maxDepth === undefined || depth < maxDepth;
	const children = node.getChildren();
	const hasChildren = children.length > 0;
	const task = node.task;

	// Tree drawing characters
	const connector = isLast ? "└── " : "├── ";
	const childPrefix = prefix + (isLast ? "    " : "│   ");

	return (
		<Box flexDirection="column">
			{/* Current node */}
			<Text>
				<Text color="gray">
					{prefix}
					{connector}
				</Text>
				{showStatus && getStatusIcon(task.status)}
				{showStatus && " "}
				<Text bold color={getStatusColor(task.status)}>
					{task.title}
				</Text>
				<Text color="gray"> ({task.id})</Text>
				{showStatus && <Text color="yellow"> [{task.status}]</Text>}
			</Text>

			{/* Description if present */}
			{task.description && (
				<Text color="gray">
					{prefix}
					{isLast ? "    " : "│   "}
					{task.description}
				</Text>
			)}

			{/* Children */}
			{shouldShowChildren && hasChildren && (
				<>
					{children.map((child, index) => (
						<TreeNodeComponent
							key={child.task.id}
							node={child}
							isLast={index === children.length - 1}
							depth={depth + 1}
							maxDepth={maxDepth}
							showStatus={showStatus}
							prefix={childPrefix}
						/>
					))}
				</>
			)}

			{/* Show truncation indicator if max depth reached */}
			{maxDepth !== undefined && depth >= maxDepth && hasChildren && (
				<Text color="gray">
					{childPrefix}⋯ ({children.length} more subtasks)
				</Text>
			)}
		</Box>
	);
}

function getStatusIcon(status: string): string {
	switch (status) {
		case "pending":
			return "⏳";
		case "in-progress":
			return "🔄";
		case "done":
			return "✅";
		case "cancelled":
			return "❌";
		default:
			return "📝";
	}
}

function getStatusColor(status: string): string {
	switch (status) {
		case "pending":
			return "yellow";
		case "in-progress":
			return "blue";
		case "done":
			return "green";
		case "cancelled":
			return "red";
		default:
			return "white";
	}
}
