import { Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import type { TaskProps } from "./_app.js";

export const options = zod.object({
	id: zod.string().describe("Task ID to remove"),
});

type Props = TaskProps<{
	options: zod.infer<typeof options>;
}>;

export default function Remove({ options, db }: Props) {
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function removeTask() {
			try {
				const success = await db.deleteTask(options.id);
				if (!success) throw new Error("Task not found");
				setResult(`Task ${options.id} removed 🗑️`);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to remove task");
			}
		}
		removeTask();
	}, [options, db]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;

	return <Text>Removing task...</Text>;
}
