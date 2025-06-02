import {
	type TaskExpansionConfig,
	type TaskExpansionResult,
	TaskService,
	createModuleLogger,
	createTaskExpansionService,
} from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description =
	"Expand a task into subtasks using complexity analysis and AI-guided expansion";

export const options = zod.object({
	taskId: zod.string().describe("Task ID to expand"),
	context: zod
		.string()
		.optional()
		.describe("Additional context for task expansion"),
	force: zod
		.boolean()
		.optional()
		.default(false)
		.describe("Force replacement of existing subtasks"),
	threshold: zod
		.number()
		.min(1)
		.max(10)
		.optional()
		.default(5)
		.describe("Complexity threshold for expansion recommendations"),
	root: zod
		.string()
		.optional()
		.describe("Root task ID - expand all leaf tasks under this root"),
	verbose: zod
		.boolean()
		.optional()
		.default(false)
		.describe("Show detailed expansion information"),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface ExpansionState {
	phase: "init" | "analyzing" | "expanding" | "complete" | "error";
	message: string;
	results: TaskExpansionResult[];
	error?: string;
	progress?: {
		current: number;
		total: number;
	};
}

export default function Expand({ options }: Props) {
	const db = useDatabase();
	const [state, setState] = useState<ExpansionState>({
		phase: "init",
		message: "Initializing task expansion...",
		results: [],
	});

	useEffect(() => {
		async function expandTasks() {
			try {
				const logger = createModuleLogger("CLI-TaskExpansion");
				const taskService = new TaskService(db);

				// Create expansion service with configuration
				const expansionConfig: TaskExpansionConfig = {
					useComplexityAnalysis: true, // Use complexity analysis
					research: true, // Always use research mode
					complexityThreshold: options.threshold,
					defaultSubtasks: 3,
					maxSubtasks: 20,
					forceReplace: options.force,
					createContextSlices: true,
					projectName: "Astrolabe",
				};

				const expansionService = createTaskExpansionService(
					logger,
					db,
					taskService,
					expansionConfig,
				);

				// Handle different expansion modes
				if (options.root) {
					// Batch expansion - expand all leaf tasks under parent
					setState((prev) => ({
						...prev,
						phase: "analyzing",
						message: `Finding leaf tasks under parent ${options.root}...`,
					}));

					// Get all tasks under the parent
					const allTasks = await db.listTasks({ parentId: options.root });

					// Filter to only leaf tasks (tasks with no children)
					const leafTasks: string[] = [];
					for (const task of allTasks) {
						const children = await db.listTasks({ parentId: task.id });
						if (children.length === 0) {
							leafTasks.push(task.id);
						}
					}

					setState((prev) => ({
						...prev,
						phase: "expanding",
						message: `Expanding ${leafTasks.length} leaf tasks...`,
						progress: { current: 0, total: leafTasks.length },
					}));

					// Expand each leaf task individually
					const results: TaskExpansionResult[] = [];
					for (const taskId of leafTasks) {
						try {
							const result = await expansionService.expandTask({
								taskId,
								context: options.context,
								force: options.force,
							});
							results.push(result);
						} catch (error) {
							logger.error("Failed to expand leaf task", {
								taskId,
								error: error instanceof Error ? error.message : String(error),
							});
						}
					}

					setState((prev) => ({
						...prev,
						phase: "complete",
						message: `Batch expansion complete: ${results.length} tasks expanded`,
						results,
					}));
				} else {
					// Single task expansion
					setState((prev) => ({
						...prev,
						phase: "analyzing",
						message: `Analyzing complexity for task ${options.taskId}...`,
					}));

					const result = await expansionService.expandTask({
						taskId: options.taskId,
						context: options.context,
						force: options.force,
					});

					setState((prev) => ({
						...prev,
						phase: "complete",
						message: `Task expansion complete: ${result.subtasks.length} subtasks created`,
						results: [result],
					}));
				}
			} catch (err) {
				setState((prev) => ({
					...prev,
					phase: "error",
					error:
						err instanceof Error ? err.message : "Failed to expand task(s)",
				}));
			}
		}

		expandTasks();
	}, [options, db]);

	// Exit the process after operation is complete
	useEffect(() => {
		if (state.phase === "complete" || state.phase === "error") {
			// Use setTimeout to ensure the component has fully rendered
			setTimeout(() => {
				process.exit(state.phase === "error" ? 1 : 0);
			}, 100);
		}
	}, [state.phase]);

	if (state.phase === "error") {
		return (
			<Box flexDirection="column">
				<Text color="red">❌ Error: {state.error}</Text>
				<Text color="gray">
					Try checking if the task ID exists with:{" "}
					<Text color="cyan">astrotask task list</Text>
				</Text>
			</Box>
		);
	}

	if (state.phase === "complete") {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="green">✅ {state.message}</Text>

				{state.results.map((result, index) => (
					<Box key={index} flexDirection="column" marginTop={1}>
						<Text color="cyan">
							📋 {result.parentTask.title} ({result.parentTask.id})
						</Text>
						<Text color="gray">
							Created {result.subtasks.length} subtasks using{" "}
							{result.metadata.expansionMethod} expansion
						</Text>

						{options.verbose && result.complexityAnalysis && (
							<Box flexDirection="column" marginLeft={2}>
								<Text color="yellow">
									Complexity Score: {result.complexityAnalysis.complexityScore}
									/10
								</Text>
								<Text color="gray">
									Reasoning: {result.complexityAnalysis.reasoning}
								</Text>
							</Box>
						)}

						<Box flexDirection="column" marginLeft={2}>
							{result.subtasks.map((subtask, subIndex) => (
								<Text key={subIndex} color="white">
									• {subtask.title} ({subtask.id})
								</Text>
							))}
						</Box>
					</Box>
				))}

				{options.verbose && state.results.length > 0 && (
					<Box flexDirection="column" marginTop={1}>
						<Text color="gray">
							Total subtasks created:{" "}
							{state.results.reduce((sum, r) => sum + r.subtasks.length, 0)}
						</Text>
						<Text color="gray">
							Context slices created:{" "}
							{state.results.reduce(
								(sum, r) => sum + r.contextSlicesCreated,
								0,
							)}
						</Text>
					</Box>
				)}
			</Box>
		);
	}

	// Loading states
	return (
		<Box flexDirection="column">
			<Text>
				{state.phase === "init" && "🔧"}
				{state.phase === "analyzing" && "🧠"}
				{state.phase === "expanding" && "📝"} {state.message}
			</Text>

			{state.progress && (
				<Text color="gray">
					Progress: {state.progress.current}/{state.progress.total}
				</Text>
			)}
		</Box>
	);
}
