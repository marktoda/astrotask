import { APP_NAME, APP_VERSION } from "@astrolabe/core";
import { Box, Text } from "ink";
import zod from "zod";

export const options = zod.object({
	version: zod.boolean().default(false).describe("Show version information"),
	help: zod.boolean().default(false).describe("Show help information"),
});

type Props = {
	options: zod.infer<typeof options>;
};

export default function Index({ options }: Props) {
	if (options.version) {
		return (
			<Text>
				{APP_NAME} CLI v{APP_VERSION}
			</Text>
		);
	}

	if (options.help) {
		return (
			<Box flexDirection="column">
				<Text>
					<Text color="cyan" bold>
						{APP_NAME}
					</Text>{" "}
					- A local-first, MCP-compatible task-navigation platform
				</Text>
				<Text> </Text>
				<Text bold>Usage:</Text>
				<Text> astrolabe [command] [options]</Text>
				<Text> </Text>
				<Text bold>Available Commands:</Text>
				<Text>
					{" "}
					<Text color="green">task</Text> Task management operations (list, add,
					update, remove, done)
				</Text>
				<Text>
					{" "}
					<Text color="green">context</Text> Context retrieval and display (show
					task details, project info)
				</Text>
				<Text>
					{" "}
					<Text color="green">db</Text> Database operations (migrate, status,
					backup)
				</Text>
				<Text> </Text>
				<Text bold>Global Options:</Text>
				<Text>
					{" "}
					<Text color="yellow">--version</Text> Show version information
				</Text>
				<Text>
					{" "}
					<Text color="yellow">--help</Text> Show this help message
				</Text>
				<Text> </Text>
				<Text>
					Use <Text color="cyan">astrolabe [command] --help</Text> for more
					information about a specific command.
				</Text>
			</Box>
		);
	}

	// Default behavior - show help
	return (
		<Box flexDirection="column">
			<Text>
				<Text color="cyan" bold>
					{APP_NAME}
				</Text>{" "}
				CLI v{APP_VERSION}
			</Text>
			<Text> </Text>
			<Text>
				Run <Text color="cyan">astrolabe --help</Text> for usage information.
			</Text>
		</Box>
	);
}
