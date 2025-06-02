import type { Task } from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase, useTaskService } from "../../context/DatabaseContext.js";

export const description =
	"Show the optimal execution order for tasks based on dependencies";

export const options = zod.object({
	taskIds: zod
		.string()
		.optional()
		.describe(
			"Comma-separated list of task IDs to order (defaults to all tasks)",
		),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface OrderResult {
	orderedTaskIds: string[];
	tasks: Task[];
	hasUnresolvableTasks: boolean;
	unresolvableTasks: string[];
}

export default function Order({ options }: Props) {
	const store = useDatabase();
	const taskService = useTaskService();
	const [result, setResult] = useState<OrderResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function calculateOrder() {
			try {
				// Get task IDs to order
				let taskIds: string[];
				if (options.taskIds) {
					taskIds = options.taskIds.split(",").map((id) => id.trim());
				} else {
					// Get all tasks
					const allTasks = await store.listTasks();
					taskIds = allTasks.map((t) => t.id);
				}

				if (taskIds.length === 0) {
					setError("No tasks found to order");
					return;
				}

				// Get topological order
				const orderedTaskIds = await taskService.getTopologicalOrder(taskIds);

				// Get task objects for display
				const tasks = await Promise.all(
					orderedTaskIds.map((id) => store.getTask(id)),
				);
				const validTasks = tasks.filter((t): t is Task => t !== null);

				// Check for unresolvable tasks (those not in the ordered list)
				const unresolvableTasks = taskIds.filter(
					(id) => !orderedTaskIds.includes(id),
				);

				setResult({
					orderedTaskIds,
					tasks: validTasks,
					hasUnresolvableTasks: unresolvableTasks.length > 0,
					unresolvableTasks,
				});
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to calculate task order",
				);
			} finally {
				setLoading(false);
			}
		}
		calculateOrder();
	}, [options, store, taskService]);

	if (loading) return <Text>Calculating optimal task order...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;
	if (!result) return <Text color="red">No order results available</Text>;

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

	return (
		<Box flexDirection="column">
			<Text bold>Optimal Task Execution Order</Text>
			<Text color="gray">
				Tasks ordered by dependencies - complete in this sequence for optimal
				workflow
			</Text>

			{result.hasUnresolvableTasks && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="red" bold>
						⚠️ Warning: Some tasks could not be ordered
					</Text>
					<Text color="red">
						This usually indicates circular dependencies. Tasks:{" "}
						{result.unresolvableTasks.join(", ")}
					</Text>
					<Text color="yellow">
						Use <Text color="cyan">astrotask task validate-dependencies</Text>{" "}
						to identify cycles
					</Text>
				</Box>
			)}

			{result.tasks.length > 0 ? (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="cyan">
						Execution Order ({result.tasks.length} tasks):
					</Text>
					{result.tasks.map((task, index) => (
						<Box key={task.id} marginTop={1}>
							<Text>
								<Text color="magenta">
									{(index + 1).toString().padStart(2, " ")}.
								</Text>{" "}
								{getStatusIcon(task.status)} <Text color="cyan">{task.id}</Text>{" "}
								- <Text bold>{task.title}</Text>
								<Text color={getStatusColor(task.status)}>
									{" "}
									[{task.status}]
								</Text>
								<Text color={getPriorityColor(task.priority)}>
									{" "}
									[{task.priority}]
								</Text>
							</Text>
							{task.description && (
								<Box marginLeft={4}>
									<Text color="gray">{task.description}</Text>
								</Box>
							)}
						</Box>
					))}
				</Box>
			) : (
				<Box marginTop={1}>
					<Text color="yellow">No tasks could be ordered</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text color="green">💡 Tips:</Text>
				<Box marginLeft={2}>
					<Text color="gray">
						• Complete tasks in the order shown for optimal dependency
						resolution
					</Text>
				</Box>
				<Box marginLeft={2}>
					<Text color="gray">
						• Tasks with the same dependencies can be worked on in parallel
					</Text>
				</Box>
				<Box marginLeft={2}>
					<Text color="gray">
						• Use <Text color="cyan">astrotask task available</Text> to see what
						can be started now
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
