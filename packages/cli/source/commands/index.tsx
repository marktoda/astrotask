import { Text, Box } from "ink";
import React from "react";
import path from "path";
import { fileURLToPath } from "url";
import { readdir, stat } from "fs/promises";

export const description = "Show help and usage information";

interface CommandInfo {
	name: string;
	description: string;
	isGroup: boolean;
	subcommands?: CommandInfo[];
}

async function discoverCommands(): Promise<CommandInfo[]> {
	const commands: CommandInfo[] = [];
	const commandsDir = path.dirname(fileURLToPath(import.meta.url));
	
	try {
		const entries = await readdir(commandsDir);
		
		for (const entry of entries) {
			if (entry === 'index.tsx' || entry === '_app.tsx') continue;
			
			const entryPath = path.join(commandsDir, entry);
			const entryStats = await stat(entryPath);
			
			if (entryStats.isDirectory()) {
				// This is a command group (like task/, dependency/)
				const subcommands = await discoverSubcommands(entryPath, entry);
				if (subcommands.length > 0) {
					// Try to get the group description from index.tsx
					let groupDescription = `${entry.charAt(0).toUpperCase()}${entry.slice(1)} commands`;
					try {
						const groupIndexPath = path.join(entryPath, 'index.tsx');
						const groupModule = await import(groupIndexPath);
						if (groupModule.description) {
							groupDescription = groupModule.description;
						}
					} catch {
						// If no index.tsx or no description, use default
					}
					
					commands.push({
						name: entry,
						description: groupDescription,
						isGroup: true,
						subcommands
					});
				}
			} else if (entry.endsWith('.tsx')) {
				// This is a top-level command
				const commandName = entry.replace('.tsx', '');
				try {
					const commandPath = path.join(commandsDir, entry);
					const commandModule = await import(commandPath);
					commands.push({
						name: commandName,
						description: commandModule.description || `${commandName} command`,
						isGroup: false
					});
				} catch {
					// Skip if we can't load the module
				}
			}
		}
	} catch (error) {
		console.warn('Failed to discover commands:', error);
	}
	
	return commands.sort((a, b) => a.name.localeCompare(b.name));
}

async function discoverSubcommands(groupPath: string, groupName: string): Promise<CommandInfo[]> {
	const subcommands: CommandInfo[] = [];
	
	try {
		const entries = await readdir(groupPath);
		
		for (const entry of entries) {
			if (entry === 'index.tsx' || !entry.endsWith('.tsx')) continue;
			
			const commandName = entry.replace('.tsx', '');
			try {
				const commandPath = path.join(groupPath, entry);
				const commandModule = await import(commandPath);
				subcommands.push({
					name: commandName,
					description: commandModule.description || `${commandName} command`,
					isGroup: false
				});
			} catch {
				// Skip if we can't load the module
			}
		}
	} catch (error) {
		console.warn(`Failed to discover subcommands for ${groupName}:`, error);
	}
	
	return subcommands.sort((a, b) => a.name.localeCompare(b.name));
}

export default function Help() {
	const [commands, setCommands] = React.useState<CommandInfo[]>([]);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		discoverCommands()
			.then(setCommands)
			.finally(() => setLoading(false));
	}, []);

	if (loading) {
		return <Text>Loading commands...</Text>;
	}

	return (
		<Box flexDirection="column" gap={1}>
			<Text bold color="cyan">
				🚀 Astrolabe CLI
			</Text>
			<Text color="gray">
				Local-first, MCP-compatible task-navigation platform
			</Text>

			<Text bold>Available Commands:</Text>
			<Box flexDirection="column" paddingLeft={2}>
				{commands.map((cmd) => (
					<Box key={cmd.name} flexDirection="column" marginBottom={1}>
						<Text>
							<Text color="cyan">{cmd.name}</Text> - {cmd.description}
						</Text>
						{cmd.isGroup && cmd.subcommands && cmd.subcommands.length > 0 && (
							<Box flexDirection="column" paddingLeft={4}>
								{cmd.subcommands.map((subcmd) => (
									<Text key={subcmd.name} color="gray">
										<Text color="yellow">{cmd.name} {subcmd.name}</Text> - {subcmd.description}
									</Text>
								))}
							</Box>
						)}
					</Box>
				))}
			</Box>

			<Text bold>Usage:</Text>
			<Box flexDirection="column" paddingLeft={2}>
				<Text>
					<Text color="cyan">astrolabe &lt;command&gt; [options]</Text> - Run a command
				</Text>
				<Text>
					<Text color="cyan">astrolabe &lt;group&gt; &lt;subcommand&gt; [options]</Text> - Run a subcommand
				</Text>
				<Text>
					<Text color="cyan">astrolabe &lt;command&gt; --help</Text> - Get detailed help for a command
				</Text>
			</Box>

			<Text bold>Examples:</Text>
			<Box flexDirection="column" paddingLeft={2}>
				<Text>
					<Text color="cyan">astrolabe task list</Text> - List all tasks
				</Text>
				<Text>
					<Text color="cyan">astrolabe task add --title "My Task"</Text> - Add a new task
				</Text>
				<Text>
					<Text color="cyan">astrolabe dependency add --dependent task1 --dependency task2</Text> - Add dependency
				</Text>
				<Text>
					<Text color="cyan">astrolabe dashboard</Text> - Launch interactive dashboard
				</Text>
			</Box>

			<Text bold>For More Information:</Text>
			<Box flexDirection="column" paddingLeft={2}>
				<Text>
					• Use <Text color="cyan">astrolabe &lt;command&gt; --help</Text> for detailed command help
				</Text>
				<Text>
					• Visit the documentation or README for complete usage guide
				</Text>
			</Box>
		</Box>
	);
}
