import {
	type GenerationError,
	type Task,
	createModuleLogger,
	createPRDTaskGenerator,
} from "@astrolabe/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description = "Generate tasks from PRD content using AI";

export const options = zod.object({
	content: zod.string().describe("PRD content to generate tasks from"),
	file: zod.string().optional().describe("Path to PRD file to read"),
	parent: zod
		.string()
		.optional()
		.describe("Parent task ID for generated tasks"),
	context: zod
		.string()
		.optional()
		.describe("Comma-separated list of existing task IDs for context"),
	type: zod
		.enum(["prd"])
		.default("prd")
		.describe("Generator type (currently only 'prd' supported)"),
	dry: zod
		.boolean()
		.default(false)
		.describe("Preview tasks without saving to database"),
	verbose: zod
		.boolean()
		.default(false)
		.describe("Show detailed generation information"),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface GenerationMetadata {
	contentLength: number;
	existingTasksCount: number;
	generatedCount: number;
	validation?: {
		valid: boolean;
		warnings?: string[];
		suggestions?: string[];
		errors?: string[];
	};
}

interface GenerationState {
	phase: "init" | "validating" | "generating" | "saving" | "complete" | "error";
	message: string;
	tasks: Task[];
	error?: string;
	metadata?: GenerationMetadata;
}

export default function Generate({ options }: Props) {
	const db = useDatabase();
	const [state, setState] = useState<GenerationState>({
		phase: "init",
		message: "Initializing task generation...",
		tasks: [],
	});

	useEffect(() => {
		async function generateTasks() {
			try {
				// Determine content source
				let content = options.content;
				if (options.file) {
					setState((prev) => ({
						...prev,
						phase: "init",
						message: `Reading PRD file: ${options.file}`,
					}));
					try {
						const fs = await import("node:fs/promises");
						content = await fs.readFile(options.file, "utf-8");
					} catch (fileError) {
						setState((prev) => ({
							...prev,
							phase: "error",
							error: `Failed to read file: ${fileError instanceof Error ? fileError.message : String(fileError)}`,
						}));
						return;
					}
				}

				if (!content.trim()) {
					setState((prev) => ({
						...prev,
						phase: "error",
						error:
							"No content provided. Use --content or --file to specify PRD content.",
					}));
					return;
				}

				// Create logger and generator
				const logger = createModuleLogger("CLI-TaskGeneration");
				const generator = createPRDTaskGenerator(logger);

				// Validate input
				setState((prev) => ({
					...prev,
					phase: "validating",
					message: "Validating PRD content...",
				}));

				const validation = await generator.validate({
					content,
					metadata: { source: "cli", file: options.file },
				});

				if (!validation.valid) {
					setState((prev) => ({
						...prev,
						phase: "error",
						error: `Invalid content: ${validation.errors?.join(", ")}`,
					}));
					return;
				}

				if (options.verbose && validation.warnings?.length) {
					setState((prev) => ({
						...prev,
						message: `Validation warnings: ${validation.warnings!.join(", ")}`,
					}));
				}

				// Load existing tasks for context if requested
				let existingTasks: Task[] = [];
				if (options.context) {
					const taskIds = options.context.split(",").map((id) => id.trim());
					setState((prev) => ({
						...prev,
						message: `Loading ${taskIds.length} existing tasks for context...`,
					}));

					const taskPromises = taskIds.map((id) => db.getTask(id));
					const tasks = await Promise.all(taskPromises);
					existingTasks = tasks.filter((task): task is Task => task !== null);

					if (options.verbose) {
						setState((prev) => ({
							...prev,
							message: `Loaded ${existingTasks.length}/${taskIds.length} tasks for context`,
						}));
					}
				}

				// Generate tasks
				setState((prev) => ({
					...prev,
					phase: "generating",
					message: "Generating tasks with AI...",
				}));

				const createTasks = await generator.generate(
					{
						content,
						context: {
							existingTasks,
							parentTaskId: options.parent,
						},
						metadata: {
							source: "cli",
							file: options.file,
							generator: options.type,
						},
					},
					options.parent ?? null,
				);

				// Preview mode - don't save to database
				if (options.dry) {
					setState((prev) => ({
						...prev,
						phase: "complete",
						message: `Generated ${createTasks.length} tasks (preview mode - not saved)`,
						tasks: createTasks as Task[],
						metadata: {
							contentLength: content.length,
							existingTasksCount: existingTasks.length,
							generatedCount: createTasks.length,
							validation,
						},
					}));
					return;
				}

				// Save tasks to database
				setState((prev) => ({
					...prev,
					phase: "saving",
					message: "Saving tasks to database...",
				}));

				const savedTasks: Task[] = [];
				for (const task of createTasks) {
					const savedTask = await db.addTask(task);
					savedTasks.push(savedTask);
				}

				setState((prev) => ({
					...prev,
					phase: "complete",
					message: `Successfully generated and saved ${savedTasks.length} tasks`,
					tasks: savedTasks,
					metadata: {
						contentLength: content.length,
						existingTasksCount: existingTasks.length,
						generatedCount: savedTasks.length,
						validation,
					},
				}));
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				let detailedError = errorMessage;

				// Handle specific generation errors
				if (error && typeof error === "object" && "type" in error) {
					const genError = error as GenerationError;
					detailedError = `${genError.message} (${genError.type})`;
				}

				setState((prev) => ({
					...prev,
					phase: "error",
					error: detailedError,
				}));
			}
		}

		generateTasks();
	}, [options, db]);

	// Render loading states
	if (state.phase === "error") {
		return (
			<Box flexDirection="column">
				<Text color="red">❌ Task Generation Failed</Text>
				<Text color="red">{state.error}</Text>
			</Box>
		);
	}

	if (state.phase !== "complete") {
		const phaseEmojis = {
			init: "🚀",
			validating: "🔍",
			generating: "🤖",
			saving: "💾",
		};

		return (
			<Box flexDirection="column">
				<Text>
					{phaseEmojis[state.phase as keyof typeof phaseEmojis]} {state.message}
				</Text>
				{options.verbose && state.phase === "generating" && (
					<Text color="gray">This may take 30-60 seconds...</Text>
				)}
			</Box>
		);
	}

	// Render success results
	return (
		<Box flexDirection="column" gap={1}>
			<Text color="green">✅ {state.message}</Text>

			{options.verbose && state.metadata && (
				<Box flexDirection="column" paddingLeft={2}>
					<Text color="cyan">Generation Details:</Text>
					<Text>
						• Content length: {state.metadata.contentLength} characters
					</Text>
					<Text>• Context tasks: {state.metadata.existingTasksCount}</Text>
					<Text>• Generated tasks: {state.metadata.generatedCount}</Text>
					{state.metadata.validation && (
						<>
							{state.metadata.validation.warnings &&
								state.metadata.validation.warnings.length > 0 && (
									<Text color="yellow">
										• Warnings: {state.metadata.validation.warnings.join(", ")}
									</Text>
								)}
							{state.metadata.validation.suggestions &&
								state.metadata.validation.suggestions.length > 0 && (
									<Text color="blue">
										• Suggestions:{" "}
										{state.metadata.validation.suggestions.join(", ")}
									</Text>
								)}
						</>
					)}
				</Box>
			)}

			{state.tasks.length > 0 && (
				<Box flexDirection="column" paddingLeft={2}>
					<Text bold>Generated Tasks:</Text>
					{state.tasks.map((task, index) => (
						<Box key={task.id || index} flexDirection="column" paddingLeft={2}>
							<Text>
								<Text color="cyan">{task.id || `[${index + 1}]`}</Text>
								{" - "}
								<Text bold>{task.title}</Text>{" "}
								<Text color="magenta">[{task.priority}]</Text>
							</Text>
							{task.description && (
								<Text color="gray"> {task.description}</Text>
							)}
							{options.verbose && task.prd && (
								<Text color="gray"> PRD: {task.prd.substring(0, 100)}...</Text>
							)}
						</Box>
					))}
				</Box>
			)}

			{options.dry && (
				<Box paddingLeft={2}>
					<Text color="yellow">
						💡 Use without --dry to save these tasks to the database
					</Text>
				</Box>
			)}
		</Box>
	);
}
