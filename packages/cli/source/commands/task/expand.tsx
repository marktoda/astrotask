import {
	type TaskExpansionConfig,
	type TaskExpansionResult,
	TaskService,
	createLLMService,
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
		.describe(
			"Root task ID - if root is a leaf, expand it directly; otherwise expand all downstream leaf tasks",
		),
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

				// Ensure root is defined (it should be since it's required in schema)
				if (!options.root) {
					throw new Error("Root task ID is required");
				}
				const rootTaskId = options.root;

				// Create LLM service
				const llmService = createLLMService({
					modelName: "gpt-4o-mini",
					temperature: 0.1,
					maxTokens: 2048,
				});

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
					llmService,
				);

				// Handle root expansion logic
				setState((prev) => ({
					...prev,
					phase: "analyzing",
					message: `Analyzing task ${rootTaskId} and finding targets for expansion...`,
				}));

				// Check if root task exists
				const rootTask = await db.getTask(rootTaskId);
				if (!rootTask) {
					throw new Error(`Root task ${rootTaskId} not found`);
				}

				// Check if root is a leaf task (has no children)
				const rootChildren = await db.listTasks({ parentId: rootTaskId });
				const isRootLeaf = rootChildren.length === 0;

				if (isRootLeaf) {
					// Root is a leaf - expand it directly
					setState((prev) => ({
						...prev,
						phase: "expanding",
						message: `Root task is a leaf - expanding directly...`,
					}));

					const result = await expansionService.expandTask({
						taskId: rootTaskId,
						context: options.context,
						force: options.force,
					});

					setState((prev) => ({
						...prev,
						phase: "complete",
						message: `Task expansion complete: ${result.subtasks.length} subtasks created`,
						results: [result],
					}));
				} else {
					// Root is not a leaf - find all downstream leaf tasks and expand them
					setState((prev) => ({
						...prev,
						phase: "analyzing",
						message: `Finding all downstream leaf tasks under ${rootTaskId}...`,
					}));

					// Get all descendant tasks using TaskService
					const allDescendants =
						await taskService.getTaskDescendants(rootTaskId);

					// Filter to only leaf tasks (tasks with no children)
					const leafTasks: string[] = [];
					for (const task of allDescendants) {
						const children = await db.listTasks({ parentId: task.id });
						if (children.length === 0) {
							leafTasks.push(task.id);
						}
					}

					setState((prev) => ({
						...prev,
						phase: "expanding",
						message: `Expanding ${leafTasks.length} downstream leaf tasks...`,
						progress: { current: 0, total: leafTasks.length },
					}));

					// Expand each leaf task individually
					const results: TaskExpansionResult[] = [];
					for (let i = 0; i < leafTasks.length; i++) {
						const taskId = leafTasks[i]!; // Safe since we're iterating within bounds
						try {
							const result = await expansionService.expandTask({
								taskId,
								context: options.context,
								force: options.force,
							});
							results.push(result);

							// Update progress
							setState((prev) => ({
								...prev,
								progress: { current: i + 1, total: leafTasks.length },
							}));
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
