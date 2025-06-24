import { Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useAstrotask } from "../../context/DatabaseContext.js";

export const description = "Add a dependency between tasks";

export const options = zod.object({
	dependent: zod.string().describe("Task ID that depends on another task"),
	dependency: zod.string().describe("Task ID that must be completed first"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function AddDependency({ options }: Props) {
	const astrotask = useAstrotask();
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function addDependency() {
			try {
				// Use store directly for simple dependency addition
				await astrotask.store.addTaskDependency(
					options.dependent,
					options.dependency,
				);
				setResult(
					`Dependency added successfully: ${options.dependent} now depends on ${options.dependency}`,
				);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to add dependency",
				);
			}
		}
		addDependency();
	}, [options, astrotask]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;

	return <Text>Adding dependency...</Text>;
}
