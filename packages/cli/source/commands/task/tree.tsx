import type { Task } from "@astrolabe/core";
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

interface TreeNode extends Task {
	children: TreeNode[];
}

export default function Tree({ options }: Props) {
	const db = useDatabase();
	const [tree, setTree] = useState<TreeNode[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const showStatus = !options.hideStatus;
	const maxDepth = options.depth;
	const rootId = options.root;

	useEffect(() => {
		async function loadTree() {
			try {
				let tasks: Task[];

				if (rootId) {
					// Get specific task and its subtree
					const rootTask = await db.getTask(rootId);
					if (!rootTask) {
						throw new Error(`Task with ID "${rootId}" not found`);
					}
					// Get all tasks to build the complete subtree
					const allTasks = await db.listTasks();
					// Filter to include root and all its descendants
					tasks = [rootTask, ...getDescendants(rootTask.id, allTasks)];
				} else {
					// Get all tasks
					tasks = await db.listTasks();
				}

				// Build the tree structure
				const treeData = buildTree(tasks, rootId);
				setTree(treeData);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load task tree",
				);
			} finally {
				setLoading(false);
			}
		}
		loadTree();
	}, [db, rootId]);

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
					key={node.id}
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
	node: TreeNode;
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
	const hasChildren = node.children.length > 0;

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
				{showStatus && getStatusIcon(node.status)}
				{showStatus && " "}
				<Text bold color={getStatusColor(node.status)}>
					{node.title}
				</Text>
				<Text color="gray"> ({node.id})</Text>
				{showStatus && <Text color="yellow"> [{node.status}]</Text>}
			</Text>

			{/* Description if present */}
			{node.description && (
				<Text color="gray">
					{prefix}
					{isLast ? "    " : "│   "}
					{node.description}
				</Text>
			)}

			{/* Children */}
			{shouldShowChildren && hasChildren && (
				<>
					{node.children.map((child, index) => (
						<TreeNodeComponent
							key={child.id}
							node={child}
							isLast={index === node.children.length - 1}
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
					{childPrefix}⋯ ({node.children.length} more subtasks)
				</Text>
			)}
		</Box>
	);
}

function getDescendants(taskId: string, allTasks: Task[]): Task[] {
	const descendants: Task[] = [];
	const children = allTasks.filter((task) => task.parentId === taskId);

	for (const child of children) {
		descendants.push(child);
		descendants.push(...getDescendants(child.id, allTasks));
	}

	return descendants;
}

function buildTree(tasks: Task[], rootId?: string): TreeNode[] {
	// Create a map for quick lookup
	const taskMap = new Map<string, TreeNode>();

	// Initialize all tasks as tree nodes
	for (const task of tasks) {
		taskMap.set(task.id, { ...task, children: [] });
	}

	// If we have a specific root, start from there
	if (rootId) {
		const rootNode = taskMap.get(rootId);
		if (rootNode) {
			buildChildren(rootNode, taskMap, tasks);
			return [rootNode];
		}
		return [];
	}

	// Build the tree by linking children to parents
	const roots: TreeNode[] = [];

	for (const task of tasks) {
		const node = taskMap.get(task.id)!;

		if (task.parentId) {
			const parent = taskMap.get(task.parentId);
			if (parent) {
				parent.children.push(node);
			} else {
				// Parent not found in current dataset, treat as root
				roots.push(node);
			}
		} else {
			// No parent, this is a root task
			roots.push(node);
		}
	}

	// Sort children by creation date for consistent ordering
	for (const node of taskMap.values()) {
		node.children.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}

	// Sort roots by creation date
	roots.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

	return roots;
}

function buildChildren(
	node: TreeNode,
	taskMap: Map<string, TreeNode>,
	allTasks: Task[],
) {
	// Find all children of this node
	const children = allTasks.filter((task) => task.parentId === node.id);

	for (const child of children) {
		const childNode = taskMap.get(child.id);
		if (childNode) {
			node.children.push(childNode);
			// Recursively build children
			buildChildren(childNode, taskMap, allTasks);
		}
	}

	// Sort children by creation date
	node.children.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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
