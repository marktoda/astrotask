import { Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description = "Mark a task as completed";

export const options = zod.object({
	id: zod.string().describe("Task ID to mark as done"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Done({ options }: Props) {
	const db = useDatabase();
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function markDone() {
			try {
				const task = await db.updateTask(options.id, { status: "done" });
				if (!task) {
					throw new Error("Task not found");
				}
				setResult(`Task ${options.id} marked as done ✔️`);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to mark task as done",
				);
			}
		}
		markDone();
	}, [options, db]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;

	return <Text>Updating task...</Text>;
}
