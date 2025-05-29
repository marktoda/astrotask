import { Box, Text } from "ink";

export const description = "Dependency management commands";

export default function DependencyOverview() {
	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				🔗 Dependency Management
			</Text>
			<Text color="gray">Manage task dependencies and relationships</Text>

			<Box flexDirection="column" marginTop={1}>
				<Text bold>Available Commands:</Text>
				<Box flexDirection="column" paddingLeft={2}>
					<Text>
						<Text color="cyan">astrolabe dependency add</Text> - Add a dependency between tasks
					</Text>
					<Text>
						<Text color="cyan">astrolabe dependency remove</Text> - Remove a dependency between tasks
					</Text>
					<Text>
						<Text color="cyan">astrolabe dependency list</Text> - View dependencies for a specific task
					</Text>
					<Text>
						<Text color="cyan">astrolabe dependency validate</Text> - Validate dependencies and detect cycles
					</Text>
					<Text>
						<Text color="cyan">astrolabe dependency tree</Text> - Visualize dependency tree
					</Text>
				</Box>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Text bold>Examples:</Text>
				<Box flexDirection="column" paddingLeft={2}>
					<Text color="gray">
						# Add a dependency (task_456 depends on task_123)
					</Text>
					<Text>
						<Text color="cyan">astrolabe dependency add</Text> --dependent task_456 --dependency task_123
					</Text>
					
					<Box marginTop={1}>
						<Text color="gray">
							# View all dependencies for a task
						</Text>
					</Box>
					<Text>
						<Text color="cyan">astrolabe dependency list</Text> --taskId task_123
					</Text>
					
					<Box marginTop={1}>
						<Text color="gray">
							# Validate all dependencies and check for cycles
						</Text>
					</Box>
					<Text>
						<Text color="cyan">astrolabe dependency validate</Text>
					</Text>

					<Box marginTop={1}>
						<Text color="gray">
							# Visualize complete dependency tree
						</Text>
					</Box>
					<Text>
						<Text color="cyan">astrolabe dependency tree</Text>
					</Text>

					<Box marginTop={1}>
						<Text color="gray">
							# Visualize tree starting from a specific task
						</Text>
					</Box>
					<Text>
						<Text color="cyan">astrolabe dependency tree</Text> --root task_123 --depth 3
					</Text>
				</Box>
			</Box>

			<Box marginTop={1}>
				<Text color="yellow">
					💡 Tip: Use <Text color="cyan">astrolabe dependency tree</Text> to visualize complex dependency relationships
				</Text>
			</Box>
		</Box>
	);
} 