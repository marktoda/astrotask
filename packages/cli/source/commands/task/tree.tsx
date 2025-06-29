import { TaskService, type TaskTree } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";
import { StatusRenderer } from "../../dashboard/utils/status-renderer.js";
import { formatPriority } from "../../utils/priority.js";

export const description =
	"Visualize task hierarchy as an interactive tree. By default, shows only pending and in-progress tasks. Use --show-all to include completed and archived tasks.";

export const options = zod.object({
	root: zod.string().optional().describe("Root task ID to start the tree from"),
	depth: zod
		.number()
		.optional()
		.describe("Maximum depth to display (default: unlimited)"),
	hideStatus: zod.boolean().default(false).describe("Hide status indicators"),
	showAll: zod
		.boolean()
		.optional()
		.default(false)
		.describe(
			"Show all tasks including done and archived (default: false, shows pending and in-progress only)",
		),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Tree({ options }: Props) {
	const db = useDatabase();
	const [tree, setTree] = useState<TaskTree[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [statusRenderer] = useState(() => StatusRenderer.createAscii()); // Use ASCII for ink output

	const showStatus = !options.hideStatus;
	const maxDepth = options.depth;
	const rootId = options.root;

	// Filter function to apply status filtering to TaskTree nodes
	const filterTaskTree = (
		tree: TaskTree,
		showCompleted: boolean,
	): TaskTree | null => {
		const isCompleted =
			tree.task.status === "done" || tree.task.status === "archived";

		// Filter children recursively
		const filteredChildren = tree
			.getChildren()
			.map((child) => filterTaskTree(child, showCompleted))
			.filter((child): child is TaskTree => child !== null);

		// If we're showing all tasks, always include this task with its filtered children
		if (showCompleted) {
			return tree.withChildren(filteredChildren);
		}

		// If we're not showing completed tasks and this task is completed
		if (isCompleted) {
			// If this task has no visible children, filter it out completely
			if (filteredChildren.length === 0) {
				return null;
			}
			// If this task has visible children, we still filter out the parent
			// This flattens the hierarchy but preserves visible children
			// For now, we'll filter out the parent entirely
			return null;
		}

		// Task is not completed, include it with filtered children
		return tree.withChildren(filteredChildren);
	};

	useEffect(() => {
		async function loadTree() {
			try {
				const taskService = new TaskService(db);

				// Determine status filtering
				let statusFilters: { statuses?: any[] } | undefined;
				if (options.showAll) {
					// Show all tasks: pass empty statuses array to override default filtering
					statusFilters = { statuses: [] };
				} else {
					// Default behavior: show only pending and in-progress
					statusFilters = { statuses: ["pending", "in-progress"] };
				}

				if (rootId) {
					// Get specific task and its subtree using TaskService with status filtering
					const rootTree = await taskService.getTaskTree(
						rootId,
						maxDepth,
						statusFilters,
					);
					if (!rootTree) {
						throw new Error(`Task with ID "${rootId}" not found`);
					}

					// Apply our own status filtering to handle edge cases
					const filteredTree = filterTaskTree(rootTree, options.showAll);
					setTree(filteredTree ? [filteredTree] : []);
				} else {
					// Use synthetic root to get all tasks as a single tree with status filtering
					const syntheticTree = await taskService.getTaskTree(
						undefined,
						maxDepth,
						statusFilters,
					);
					if (syntheticTree) {
						// Extract the root tasks from synthetic root children
						const rootTasks = [...syntheticTree.getChildren()];

						// Sort root tasks to put completed ones at the bottom
						const sortedRootTasks = rootTasks.sort((a, b) => {
							const aIsDone =
								a.task.status === "done" || a.task.status === "archived";
							const bIsDone =
								b.task.status === "done" || b.task.status === "archived";

							// If one is done and the other isn't, put done task last
							if (aIsDone && !bIsDone) return 1;
							if (!aIsDone && bIsDone) return -1;

							// If both have same "doneness", sort by priority score (higher scores first)
							const aScore = a.task.priorityScore ?? 50;
							const bScore = b.task.priorityScore ?? 50;
							if (aScore !== bScore) {
								return bScore - aScore; // Higher scores first
							}

							// If same priority score, sort by creation date (older tasks first)
							return a.task.createdAt.getTime() - b.task.createdAt.getTime();
						});

						setTree(sortedRootTasks);
					} else {
						setTree([]);
					}
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
	}, [db, rootId, maxDepth, options.showAll]);

	// Exit the process after rendering is complete
	useEffect(() => {
		if (!loading) {
			// Use setTimeout to ensure the component has fully rendered
			setTimeout(() => {
				process.exit(error ? 1 : 0);
			}, 100);
		}
	}, [loading, error]);

	if (loading) return <Text>Loading task tree...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;

	if (tree.length === 0) {
		const filterText = options.showAll ? "" : " (pending and in-progress only)";

		return (
			<Box flexDirection="column">
				<Text>No tasks found{filterText}.</Text>
				<Text>
					Use <Text color="cyan">astrotask task add --title="Task name"</Text>{" "}
					to create your first task.
				</Text>
				{!options.showAll && (
					<Text color="gray">
						💡 Use <Text color="cyan">--show-all</Text> to see all tasks
						including completed ones.
					</Text>
				)}
			</Box>
		);
	}

	const filterSummary = options.showAll
		? " (showing all)"
		: " (pending and in-progress only)";

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				🌳 Task Tree {rootId ? `(from ${rootId})` : "(All Tasks)"}
				{maxDepth !== undefined && (
					<Text color="gray"> (max depth: {maxDepth})</Text>
				)}
				<Text color="gray">{filterSummary}</Text>
			</Text>
			{!options.showAll && (
				<Text color="gray">
					💡 Use <Text color="cyan">--show-all</Text> to include completed and
					archived tasks
				</Text>
			)}
			<Text> </Text>
			{tree.map((node, index) => (
				<TreeNodeComponent
					key={node.task.id}
					node={node}
					isLast={index === tree.length - 1}
					depth={0}
					maxDepth={maxDepth}
					showStatus={showStatus}
					statusRenderer={statusRenderer}
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
						<Text color="gray">{statusRenderer.getLegendText()}</Text>
						<Text color="gray">
							Status may be inherited from parent tasks (effective status)
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
	statusRenderer: StatusRenderer;
	prefix: string;
}

function TreeNodeComponent({
	node,
	isLast,
	depth,
	maxDepth,
	showStatus,
	statusRenderer,
	prefix,
}: TreeNodeComponentProps) {
	const shouldShowChildren = maxDepth === undefined || depth < maxDepth;
	const children = node.getChildren();

	// Sort children to put completed tasks at the bottom
	const sortedChildren = [...children].sort((a, b) => {
		const aIsDone = a.task.status === "done" || a.task.status === "archived";
		const bIsDone = b.task.status === "done" || b.task.status === "archived";

		// If one is done and the other isn't, put done task last
		if (aIsDone && !bIsDone) return 1;
		if (!aIsDone && bIsDone) return -1;

		// If both have same "doneness", sort by priority score (higher scores first)
		const aScore = a.task.priorityScore ?? 50;
		const bScore = b.task.priorityScore ?? 50;
		if (aScore !== bScore) {
			return bScore - aScore; // Higher scores first
		}

		// If same priority score, sort by creation date (older tasks first)
		return a.task.createdAt.getTime() - b.task.createdAt.getTime();
	});

	const hasChildren = children.length > 0;
	const task = node.task;

	// Get both actual and effective status
	const actualStatus = task.status;
	// Fallback for effective status if method doesn't exist yet
	const effectiveStatus = (node as any).getEffectiveStatus
		? (node as any).getEffectiveStatus()
		: actualStatus;
	const statusInherited = actualStatus !== effectiveStatus;

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
				{showStatus && statusRenderer.getGlyph(effectiveStatus)}
				{showStatus && " "}
				<Text bold color={statusRenderer.getColor(effectiveStatus)}>
					{task.title}
				</Text>
				<Text color="gray"> ({task.id})</Text>
				{showStatus && (
					<>
						<Text color="yellow"> [{effectiveStatus}]</Text>
						{statusInherited && (
							<Text color="gray"> (inherited from ancestor)</Text>
						)}
					</>
				)}
				{/* Priority display */}
				<Text color="magenta"> [{formatPriority(task.priorityScore)}]</Text>
			</Text>

			{/* Description if present */}
			{task.description && (
				<Text color="gray">
					{prefix}
					{isLast ? "    " : "│   "}
					{task.description}
				</Text>
			)}

			{/* Show actual status if different from effective */}
			{showStatus && statusInherited && (
				<Text color="gray">
					{prefix}
					{isLast ? "    " : "│   "}
					Actual status: {actualStatus}
				</Text>
			)}

			{/* Children */}
			{shouldShowChildren && hasChildren && (
				<>
					{sortedChildren.map((child, index) => (
						<TreeNodeComponent
							key={child.task.id}
							node={child}
							isLast={index === sortedChildren.length - 1}
							depth={depth + 1}
							maxDepth={maxDepth}
							showStatus={showStatus}
							statusRenderer={statusRenderer}
							prefix={childPrefix}
						/>
					))}
				</>
			)}

			{/* Show truncation indicator if max depth reached */}
			{maxDepth !== undefined && depth >= maxDepth && hasChildren && (
				<Text color="gray">
					{childPrefix}⋯ ({sortedChildren.length} more subtasks)
				</Text>
			)}
		</Box>
	);
}
