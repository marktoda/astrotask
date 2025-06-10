import type { Task } from "@astrotask/core";
import { TASK_IDENTIFIERS } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";
import { formatPriority } from "../../utils/priority.js";

export const description =
	"List tasks with status and priority information. By default, shows only pending and in-progress tasks. Use --show-all to include completed and archived tasks.";

export const options = zod.object({
	status: zod.string().optional().describe("Filter by task status"),
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

export default function List({ options }: Props) {
	const db = useDatabase();
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadTasks() {
			try {
				// Apply status filtering logic using the new statuses array parameter
				let filters: { statuses?: any[] } = {};

				if (options.status) {
					// If specific status is requested, use it
					filters.statuses = [options.status];
				} else if (options.showAll) {
					// Show all tasks: pass empty statuses array
					filters.statuses = [];
				} else {
					// Default behavior: show only pending and in-progress
					filters.statuses = ["pending", "in-progress"];
				}

				const tasks = await db.listTasks(filters);
				setTasks(tasks);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load tasks");
			} finally {
				setLoading(false);
			}
		}
		loadTasks();
	}, [db, options]);

	if (loading) return <Text>Loading tasks...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;

	if (tasks.length === 0) {
		const filterText = options.status
			? ` with status "${options.status}"`
			: options.showAll
				? ""
				: " (pending and in-progress only)";

		return (
			<Box flexDirection="column">
				<Text>No tasks found{filterText}.</Text>
				<Text>
					Use <Text color="cyan">astrotask task add --title="Task name"</Text>{" "}
					to create your first task.
				</Text>
				{!options.showAll && !options.status && (
					<Text color="gray">
						💡 Use <Text color="cyan">--show-all</Text> to see all tasks
						including completed ones.
					</Text>
				)}
			</Box>
		);
	}

	// Root tasks are now children of PROJECT_ROOT
	const rootTasks = tasks.filter(
		(t) => t.parentId === TASK_IDENTIFIERS.PROJECT_ROOT,
	);
	// Subtasks are children of user tasks (not PROJECT_ROOT)
	const subtasks = tasks.filter(
		(t) => t.parentId && t.parentId !== TASK_IDENTIFIERS.PROJECT_ROOT,
	);

	const filterSummary = options.status
		? ` (filtered by status: ${options.status})`
		: options.showAll
			? " (showing all)"
			: " (pending and in-progress only)";

	return (
		<Box flexDirection="column">
			<Text bold>
				Tasks ({tasks.length}){filterSummary}
			</Text>
			{!options.showAll && !options.status && (
				<Text color="gray">
					💡 Use <Text color="cyan">--show-all</Text> to include completed and
					archived tasks
				</Text>
			)}
			{rootTasks.length > 0 && (
				<>
					<Text> </Text>
					<Text bold color="cyan">
						Root Tasks ({rootTasks.length})
					</Text>
					{rootTasks.map((task) => (
						<Box key={task.id} flexDirection="column" marginBottom={1}>
							<Text>
								<Text color="cyan">{task.id}</Text> -{" "}
								<Text bold>{task.title}</Text>
								{task.status && <Text color="yellow"> [{task.status}]</Text>}
								<Text color="magenta">
									{" "}
									[{formatPriority(task.priorityScore)}]
								</Text>
							</Text>
							{task.description && (
								<Text color="gray"> {task.description}</Text>
							)}
						</Box>
					))}
				</>
			)}
			{subtasks.length > 0 && (
				<>
					<Text> </Text>
					<Text bold color="green">
						Subtasks ({subtasks.length})
					</Text>
					{subtasks.map((task) => (
						<Box key={task.id} flexDirection="column" marginBottom={1}>
							<Text>
								<Text color="cyan">{task.id}</Text> -{" "}
								<Text bold>{task.title}</Text>
								{task.status && <Text color="yellow"> [{task.status}]</Text>}
								<Text color="magenta">
									{" "}
									[{formatPriority(task.priorityScore)}]
								</Text>
								<Text color="gray"> (parent: {task.parentId})</Text>
							</Text>
							{task.description && (
								<Text color="gray"> {task.description}</Text>
							)}
						</Box>
					))}
				</>
			)}
		</Box>
	);
}
