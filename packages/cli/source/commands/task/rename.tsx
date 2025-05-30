import { Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description = "Rename a task";

export const options = zod.object({
	id: zod.string().describe("Task ID to rename"),
	title: zod.string().describe("New task title"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Rename({ options }: Props) {
	const db = useDatabase();
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function renameTask() {
			try {
				const updated = await db.updateTask(options.id, { title: options.title });
				if (!updated) throw new Error("Task not found");
				setResult(`Task ${options.id} renamed to "${options.title}" ✨`);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to rename task");
			}
		}
		renameTask();
	}, [options, db]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;

	return <Text>Renaming task...</Text>;
} 