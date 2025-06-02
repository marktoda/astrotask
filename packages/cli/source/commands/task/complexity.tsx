import {
	createComplexityAnalyzer,
	createComplexityContextService,
	createModuleLogger,
} from "@astrotask/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description =
	"Analyze task complexity using AI to determine implementation difficulty and subtask recommendations";

export const options = zod.object({
	nodeId: zod
		.string()
		.optional()
		.describe(
			"Specific task ID to analyze (includes all children). If not provided, analyzes all tasks",
		),
	threshold: zod
		.number()
		.min(1)
		.max(10)
		.optional()
		.default(5)
		.describe("Minimum complexity score for expansion recommendations (1-10)"),
	research: zod
		.boolean()
		.optional()
		.default(false)
		.describe("Enable research mode for more accurate analysis"),
	createContext: zod
		.boolean()
		.optional()
		.default(true)
		.describe("Create context slices for analyzed tasks"),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface ComplexityAnalysisResult {
	report: any;
	message: string;
	contextSlicesCreated?: number;
	contextMessage?: string;
}

export default function Complexity({ options }: Props) {
	const db = useDatabase();
	const [result, setResult] = useState<ComplexityAnalysisResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function runComplexityAnalysis() {
			try {
				const logger = createModuleLogger("complexity-cli");

				// Create complexity analyzer
				const analyzer = createComplexityAnalyzer(logger, {
					threshold: options.threshold,
					research: options.research,
					batchSize: 5,
					projectName: "Astrolabe",
				});

				// Create complexity context service
				const contextService = createComplexityContextService(logger, db, {
					threshold: options.threshold,
					research: options.research,
					batchSize: 5,
					projectName: "Astrolabe",
					autoUpdate: true,
					includeRecommendations: true,
				});

				let report;
				let analysisMessage: string;
				let contextSlicesCreated = 0;
				let contextMessage = "";

				if (options.nodeId) {
					// Analyze specific node and children
					report = await analyzer.analyzeNodeAndChildren(
						options.nodeId,
						async () => await db.listTasks(),
					);
					analysisMessage = `Analyzed node ${options.nodeId} and its ${report.meta.tasksAnalyzed - 1} children`;

					// Create context slices for node and children
					if (options.createContext) {
						try {
							const contextResult =
								await contextService.generateComplexityContextForNodeAndChildren(
									options.nodeId,
								);
							contextSlicesCreated = contextResult.contexts.length;
							contextMessage = `Created ${contextSlicesCreated} context slices for node and children`;
						} catch (contextError) {
							logger.warn("Failed to create context slices", {
								error: contextError,
							});
							contextMessage =
								"Failed to create context slices (analysis still completed)";
						}
					}
				} else {
					// Analyze all tasks
					const allTasks = await db.listTasks();
					report = await analyzer.analyzeTasks(allTasks);
					analysisMessage = `Analyzed all ${report.meta.tasksAnalyzed} tasks in the project`;

					// Create context slices for all tasks
					if (options.createContext) {
						try {
							const taskIds = allTasks.map((task) => task.id);
							const contexts =
								await contextService.generateComplexityContextBatch(taskIds);
							contextSlicesCreated = contexts.length;
							contextMessage = `Created ${contextSlicesCreated} context slices for all tasks`;
						} catch (contextError) {
							logger.warn("Failed to create context slices", {
								error: contextError,
							});
							contextMessage =
								"Failed to create context slices (analysis still completed)";
						}
					}
				}

				setResult({
					report,
					message: analysisMessage,
					contextSlicesCreated,
					contextMessage,
				});
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to analyze complexity",
				);
			} finally {
				setLoading(false);
			}
		}

		runComplexityAnalysis();
	}, [options, db]);

	if (loading) {
		return (
			<Box flexDirection="column">
				<Text>🧪 Analyzing task complexity...</Text>
				{options.nodeId && (
					<Text color="gray">
						Analyzing node {options.nodeId} and all children
					</Text>
				)}
				{options.research && (
					<Text color="gray">Using research mode for enhanced analysis</Text>
				)}
				{options.createContext && (
					<Text color="gray">Creating complexity context slices...</Text>
				)}
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column">
				<Text color="red">❌ Error: {error}</Text>
				<Text color="gray">
					Try checking if the node ID exists with:{" "}
					<Text color="cyan">astrotask task list</Text>
				</Text>
			</Box>
		);
	}

	if (!result) {
		return <Text color="red">No analysis result available</Text>;
	}

	const { report, message, contextSlicesCreated, contextMessage } = result;
	const avgComplexity =
		report.complexityAnalysis.reduce(
			(sum: number, t: any) => sum + t.complexityScore,
			0,
		) / report.complexityAnalysis.length;
	const highComplexityTasks = report.complexityAnalysis.filter(
		(t: any) => t.complexityScore >= options.threshold,
	);

	return (
		<Box flexDirection="column" gap={1}>
			{/* Header */}
			<Box flexDirection="column">
				<Text bold color="cyan">
					📊 Task Complexity Analysis Results
				</Text>
				<Text color="green">✅ {message}</Text>
				{contextMessage && (
					<Text
						color={
							contextSlicesCreated && contextSlicesCreated > 0
								? "green"
								: "yellow"
						}
					>
						📄 {contextMessage}
					</Text>
				)}
			</Box>

			{/* Summary Statistics */}
			<Box flexDirection="column">
				<Text bold>📈 Summary</Text>
				<Box flexDirection="column" paddingLeft={2}>
					<Text>
						Tasks Analyzed:{" "}
						<Text color="cyan">{report.meta.tasksAnalyzed}</Text>
					</Text>
					<Text>
						Average Complexity:{" "}
						<Text
							color={
								avgComplexity >= 7
									? "red"
									: avgComplexity >= 5
										? "yellow"
										: "green"
							}
						>
							{avgComplexity.toFixed(1)}/10
						</Text>
					</Text>
					<Text>
						High Complexity Tasks (≥{options.threshold}):{" "}
						<Text color={highComplexityTasks.length > 0 ? "yellow" : "green"}>
							{highComplexityTasks.length}
						</Text>
					</Text>
					<Text>
						Recommended Subtasks:{" "}
						<Text color="cyan">
							{report.complexityAnalysis.reduce(
								(sum: number, t: any) => sum + t.recommendedSubtasks,
								0,
							)}
						</Text>
					</Text>
					<Text>
						Research Mode:{" "}
						<Text color={options.research ? "green" : "gray"}>
							{options.research ? "Enabled" : "Disabled"}
						</Text>
					</Text>
					{contextSlicesCreated !== undefined && (
						<Text>
							Context Slices Created:{" "}
							<Text color="cyan">{contextSlicesCreated}</Text>
						</Text>
					)}
				</Box>
			</Box>

			{/* Complexity Distribution */}
			<Box flexDirection="column">
				<Text bold>📊 Complexity Distribution</Text>
				<Box flexDirection="column" paddingLeft={2}>
					{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
						const tasksAtScore = report.complexityAnalysis.filter(
							(t: any) => t.complexityScore === score,
						).length;
						if (tasksAtScore === 0) return null;

						const percentage = (
							(tasksAtScore / report.meta.tasksAnalyzed) *
							100
						).toFixed(1);
						const color = score >= 8 ? "red" : score >= 6 ? "yellow" : "green";
						const bar = "█".repeat(Math.ceil((tasksAtScore / 10) * 5) || 1);

						return (
							<Text key={score}>
								<Text color={color}>
									{score}: {bar} {tasksAtScore} ({percentage}%)
								</Text>
							</Text>
						);
					})}
				</Box>
			</Box>

			{/* High Complexity Tasks */}
			{highComplexityTasks.length > 0 && (
				<Box flexDirection="column">
					<Text bold color="yellow">
						⚠️ High Complexity Tasks (Score ≥ {options.threshold})
					</Text>
					<Box flexDirection="column" paddingLeft={2}>
						{highComplexityTasks.slice(0, 5).map((task: any) => (
							<Text key={task.taskId}>
								<Text color="red">{task.complexityScore}/10</Text>{" "}
								<Text color="cyan">#{task.taskId}</Text> {task.taskTitle}
								{task.recommendedSubtasks > 1 && (
									<Text color="gray">
										{" "}
										(→ {task.recommendedSubtasks} subtasks)
									</Text>
								)}
							</Text>
						))}
						{highComplexityTasks.length > 5 && (
							<Text color="gray">
								... and {highComplexityTasks.length - 5} more
							</Text>
						)}
					</Box>
				</Box>
			)}

			{/* Quick Actions */}
			<Box flexDirection="column">
				<Text bold>⚡ Quick Actions</Text>
				<Box flexDirection="column" paddingLeft={2}>
					{highComplexityTasks.length > 0 && (
						<Text>
							<Text color="cyan">
								astrotask task complexity --nodeId=
								{highComplexityTasks[0].taskId}
							</Text>{" "}
							- Analyze specific high-complexity task
						</Text>
					)}
					<Text>
						<Text color="cyan">astrotask task tree</Text> - View task hierarchy
					</Text>
					{contextSlicesCreated && contextSlicesCreated > 0 && (
						<Text>
							<Text color="cyan">astrotask context list</Text> - View created
							context slices
						</Text>
					)}
					<Text>
						<Text color="cyan">astrotask task expand --id=&lt;taskId&gt;</Text>{" "}
						- Expand high-complexity tasks into subtasks
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
