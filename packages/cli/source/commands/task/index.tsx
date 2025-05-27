import { Box, Text } from "ink";
import zod from "zod";
import type { TaskProps } from "./_app.js";
import List from "./list.js";

export const options = zod.object({
	help: zod.boolean().default(false).describe("Show help for task commands"),
});

type Props = TaskProps<{
	options: zod.infer<typeof options>;
}>;

function TaskHelp() {
	return (
		<Box flexDirection="column">
			<Text bold>Task Management Commands</Text>
			<Text> </Text>
			<Text bold>Usage:</Text>
			<Text> astrolabe task [command] [options]</Text>
			<Text> </Text>
			<Text bold>Commands:</Text>
			<Text>
				{" "}
				<Text color="green">list</Text> List all tasks
			</Text>
			<Text>
				{" "}
				<Text color="green">add</Text> Add a new task
			</Text>
			<Text>
				{" "}
				<Text color="green">update</Text> Update an existing task
			</Text>
			<Text>
				{" "}
				<Text color="green">remove</Text> Remove a task
			</Text>
			<Text>
				{" "}
				<Text color="green">done</Text> Mark a task as completed
			</Text>
			<Text> </Text>
			<Text bold>Examples:</Text>
			<Text> astrolabe task list</Text>
			<Text>
				{" "}
				astrolabe task add --title="Fix bug" --description="Fix login issue"
			</Text>
			<Text> astrolabe task done --id="task-123"</Text>
			<Text> astrolabe task --help</Text>
		</Box>
	);
}

export default function TaskIndex({ options, db }: Props) {
	if (options.help) {
		return <TaskHelp />;
	}

	// Default to list when no specific subcommand is given
	return <List options={{}} db={db} />;
}
