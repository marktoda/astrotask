import { createComplexityAnalyzer, createModuleLogger } from "@astrolabe/core";
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
	output: zod
		.string()
		.optional()
		.describe("Output file path for the complexity report (optional)"),
	save: zod
		.boolean()
		.optional()
		.default(true)
		.describe("Save the report to a file"),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface ComplexityAnalysisResult {
	report: any;
	savedTo?: string;
	message: string;
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

				let report;
				let analysisMessage: string;

				if (options.nodeId) {
					// Analyze specific node and children
					report = await analyzer.analyzeNodeAndChildren(
						options.nodeId,
						async () => await db.listTasks(),
					);
					analysisMessage = `Analyzed node ${options.nodeId} and its ${report.meta.tasksAnalyzed - 1} children`;
				} else {
					// Analyze all tasks
					const allTasks = await db.listTasks();
					report = await analyzer.analyzeTasks(allTasks);
					analysisMessage = `Analyzed all ${report.meta.tasksAnalyzed} tasks in the project`;
				}

				let savedTo: string | undefined;

				if (options.save) {
					// Save report to file
					const outputPath =
						options.output ||
						(options.nodeId
							? `complexity-report-${options.nodeId}.json`
							: "complexity-report.json");

					const fs = await import("fs");
					const path = await import("path");

					// Ensure directory exists
					await fs.promises.mkdir(path.dirname(outputPath), {
						recursive: true,
					});

					// Write report
					await fs.promises.writeFile(
						outputPath,
						JSON.stringify(report, null, 2),
						"utf-8",
					);
					savedTo = outputPath;
				}

				setResult({
					report,
					savedTo,
					message: analysisMessage,
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
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column">
				<Text color="red">❌ Error: {error}</Text>
				<Text color="gray">
					Try checking if the node ID exists with:{" "}
					<Text color="cyan">astrolabe task list</Text>
				</Text>
			</Box>
		);
	}

	if (!result) {
		return <Text color="red">No analysis result available</Text>;
	}

	const { report, savedTo, message } = result;
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
				{savedTo && <Text color="gray">Report saved to: {savedTo}</Text>}
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
				</Box>
			</Box>

			{/* Complexity Distribution */}
			<Box flexDirection="column">
				<Text bold>📊 Complexity Distribution</Text>
				<Box flexDirection="column" paddingLeft={2}>
					{(() => {
						const distribution: Record<string, number> = {};
						for (const task of report.complexityAnalysis) {
							const score = task.complexityScore.toString();
							distribution[score] = (distribution[score] || 0) + 1;
						}
						return Object.entries(distribution)
							.sort(([a], [b]) => Number(a) - Number(b))
							.map(([score, count]) => (
								<Text key={score}>
									Score {score}: <Text color="cyan">{count}</Text> task
									{count !== 1 ? "s" : ""}
								</Text>
							));
					})()}
				</Box>
			</Box>

			{/* High Complexity Tasks */}
			{highComplexityTasks.length > 0 && (
				<Box flexDirection="column">
					<Text bold color="yellow">
						⚠️ High Complexity Tasks Requiring Attention
					</Text>
					<Box flexDirection="column" paddingLeft={2}>
						{highComplexityTasks
							.sort((a: any, b: any) => b.complexityScore - a.complexityScore)
							.slice(0, 5) // Show top 5
							.map((task: any) => (
								<Box key={task.taskId} flexDirection="column" marginBottom={1}>
									<Text>
										<Text color="cyan">{task.taskId}</Text>:{" "}
										<Text bold>{task.taskTitle}</Text>
									</Text>
									<Text color="gray" wrap="wrap">
										Complexity:{" "}
										<Text color={task.complexityScore >= 8 ? "red" : "yellow"}>
											{task.complexityScore}/10
										</Text>
										{" | "}
										Recommended Subtasks:{" "}
										<Text color="cyan">{task.recommendedSubtasks}</Text>
									</Text>
									<Text color="gray" wrap="wrap">
										{task.reasoning.length > 100
											? `${task.reasoning.substring(0, 100)}...`
											: task.reasoning}
									</Text>
								</Box>
							))}
						{highComplexityTasks.length > 5 && (
							<Text color="gray">
								... and {highComplexityTasks.length - 5} more
							</Text>
						)}
					</Box>
				</Box>
			)}

			{/* All Tasks Summary */}
			<Box flexDirection="column">
				<Text bold>📋 All Tasks Analyzed</Text>
				<Box flexDirection="column" paddingLeft={2}>
					{report.complexityAnalysis
						.sort((a: any, b: any) => b.complexityScore - a.complexityScore)
						.map((task: any) => (
							<Text key={task.taskId}>
								<Text color="cyan">{task.taskId}</Text>: {task.taskTitle}{" "}
								<Text
									color={
										task.complexityScore >= 8
											? "red"
											: task.complexityScore >= 5
												? "yellow"
												: "green"
									}
								>
									[{task.complexityScore}/10]
								</Text>{" "}
								<Text color="gray">({task.recommendedSubtasks} subtasks)</Text>
							</Text>
						))}
				</Box>
			</Box>

			{/* Quick Actions */}
			<Box flexDirection="column">
				<Text bold>⚡ Quick Actions</Text>
				<Box flexDirection="column" paddingLeft={2}>
					{savedTo && (
						<Text>
							<Text color="cyan">cat {savedTo}</Text> - View full JSON report
						</Text>
					)}
					{highComplexityTasks.length > 0 && (
						<Text>
							<Text color="cyan">
								astrolabe task complexity --nodeId=
								{highComplexityTasks[0].taskId}
							</Text>{" "}
							- Analyze specific high-complexity task
						</Text>
					)}
					<Text>
						<Text color="cyan">astrolabe task tree</Text> - View task hierarchy
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
