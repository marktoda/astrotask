import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useTaskService } from "../../context/DatabaseContext.js";

export const description = "Validate task dependencies and detect cycles";

export const options = zod.object({
	dependent: zod
		.string()
		.optional()
		.describe(
			"Validate a specific dependency relationship - dependent task ID",
		),
	dependency: zod
		.string()
		.optional()
		.describe(
			"Validate a specific dependency relationship - dependency task ID",
		),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface ValidationResult {
	hasSpecificValidation: boolean;
	specificValidation?: {
		valid: boolean;
		errors: string[];
		warnings?: string[];
		cycles: string[][];
	};
	globalCycles: string[][];
}

export default function ValidateDependencies({ options }: Props) {
	const taskService = useTaskService();
	const [result, setResult] = useState<ValidationResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function validateDependencies() {
			try {
				const validationResult: ValidationResult = {
					hasSpecificValidation: !!(options.dependent && options.dependency),
					globalCycles: [],
				};

				// If specific dependency validation is requested
				if (options.dependent && options.dependency) {
					const validation = await taskService.validateTaskDependency(
						options.dependent,
						options.dependency,
					);
					validationResult.specificValidation = validation;
				}

				// Always check for global cycles
				const cycles = await taskService.findDependencyCycles();
				validationResult.globalCycles = cycles;

				setResult(validationResult);
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to validate dependencies",
				);
			} finally {
				setLoading(false);
			}
		}
		validateDependencies();
	}, [options, taskService]);

	if (loading) return <Text>Validating dependencies...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;
	if (!result) return <Text color="red">No validation results available</Text>;

	return (
		<Box flexDirection="column">
			<Text bold>Dependency Validation Results</Text>

			{result.hasSpecificValidation && result.specificValidation && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="cyan">
						Specific Validation: {options.dependent} → {options.dependency}
					</Text>

					{result.specificValidation.valid ? (
						<Box marginTop={1}>
							<Text color="green">✅ This dependency can be safely added</Text>
						</Box>
					) : (
						<Box flexDirection="column" marginTop={1}>
							<Text color="red">❌ This dependency cannot be added:</Text>
							{result.specificValidation.errors.map((error, index) => (
								<Box key={index} marginLeft={2}>
									<Text color="red">• {error}</Text>
								</Box>
							))}
						</Box>
					)}

					{result.specificValidation.warnings &&
						result.specificValidation.warnings.length > 0 && (
							<Box flexDirection="column" marginTop={1}>
								<Text color="yellow">⚠️ Warnings:</Text>
								{result.specificValidation.warnings.map((warning, index) => (
									<Box key={index} marginLeft={2}>
										<Text color="yellow">• {warning}</Text>
									</Box>
								))}
							</Box>
						)}

					{result.specificValidation.cycles.length > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text color="red" bold>
								Cycles that would be created:
							</Text>
							{result.specificValidation.cycles.map((cycle, index) => (
								<Box key={index} marginLeft={2}>
									<Text color="red">• {cycle.join(" → ")}</Text>
								</Box>
							))}
						</Box>
					)}
				</Box>
			)}

			<Box flexDirection="column" marginTop={1}>
				<Text bold color="blue">
					Global Dependency Graph Validation
				</Text>

				{result.globalCycles.length === 0 ? (
					<Box marginTop={1}>
						<Text color="green">
							✅ No cycles detected in the dependency graph
						</Text>
					</Box>
				) : (
					<Box flexDirection="column" marginTop={1}>
						<Text color="red">❌ Cycles detected in the dependency graph:</Text>
						{result.globalCycles.map((cycle, index) => (
							<Box key={index} marginLeft={2} marginTop={1}>
								<Text color="red">
									Cycle {index + 1}: {cycle.join(" → ")}
								</Text>
							</Box>
						))}
						<Box marginTop={1}>
							<Text color="yellow">
								⚠️ These cycles prevent proper task ordering and should be
								resolved.
							</Text>
						</Box>
					</Box>
				)}
			</Box>

			<Box marginTop={1}>
				<Text color="gray">
					💡 Tip: Use <Text color="cyan">astrolabe dependency remove</Text> to
					break cycles
				</Text>
			</Box>
		</Box>
	);
}
