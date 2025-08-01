import { Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useAstrotask } from "../../context/DatabaseContext.js";

export const description = "Remove a dependency between tasks";

export const options = zod.object({
	dependent: zod
		.string()
		.describe("Task ID that currently depends on another task"),
	dependency: zod.string().describe("Task ID to remove as a dependency"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function RemoveDependency({ options }: Props) {
	const astrotask = useAstrotask();
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function removeDependency() {
			try {
				// Use dependency service for removal since store doesn't have remove method
				const removed = await astrotask.dependencyService.removeDependency(
					options.dependent,
					options.dependency,
				);

				if (removed) {
					setResult(
						`Dependency removed successfully: ${options.dependent} no longer depends on ${options.dependency}`,
					);
				} else {
					setError("Dependency not found or could not be removed");
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to remove dependency",
				);
			}
		}
		removeDependency();
	}, [options, astrotask]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;

	return <Text>Removing dependency...</Text>;
}
