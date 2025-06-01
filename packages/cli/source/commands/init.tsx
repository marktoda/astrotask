import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { createDatabase } from "@astrolabe/core";
import { access, mkdir, writeFile } from "fs/promises";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import zod from "zod";

export const description =
	"Initialize repository for task management with MCP configuration";

export const options = zod.object({
	editor: zod
		.enum(["cursor", "roo", "cline", "claude-code", "claude-desktop"])
		.optional()
		.describe("Editor type to configure MCP for"),
	"database-path": zod
		.string()
		.optional()
		.describe("Database file path (default: ./data/astrolabe.db)"),
	force: zod
		.boolean()
		.optional()
		.default(false)
		.describe("Overwrite existing configuration files"),
});

type Props = {
	options: zod.infer<typeof options>;
};

interface InitResult {
	success: boolean;
	message: string;
	details?: string[];
}

interface InteractiveOptions {
	editor: "cursor" | "roo" | "cline" | "claude-code" | "claude-desktop";
	databasePath: string;
	force: boolean;
}

interface PromptState {
	currentStep: "editor" | "database" | "force" | "complete";
	editor?: string;
	databasePath?: string;
	force?: boolean;
}

// Get absolute path to the MCP server
function getMcpServerPath(): string {
	const currentFile = fileURLToPath(import.meta.url);
	const projectRoot = resolve(dirname(currentFile), "../../../..");
	return join(projectRoot, "packages/mcp/dist/packages/mcp/src/index.js");
}

// Generate MCP configuration for different editors
function generateMcpConfig(
	editor: string,
	mcpServerPath: string,
	databasePath: string,
): object {
	const absoluteDbPath = resolve(databasePath);

	switch (editor) {
		case "cursor":
			return {
				mcpServers: {
					"astrolabe-task": {
						command: "node",
						args: [mcpServerPath],
						env: {
							DATABASE_PATH: absoluteDbPath,
						},
					},
				},
			};

		case "roo":
			return {
				mcpServers: {
					"astrolabe-task": {
						command: "node",
						args: [mcpServerPath],
						env: {
							DATABASE_PATH: absoluteDbPath,
						},
					},
				},
			};

		case "cline":
			// Cline configuration format (research needed)
			return {
				mcpServers: {
					"astrolabe-task": {
						command: "node",
						args: [mcpServerPath],
						env: {
							DATABASE_PATH: absoluteDbPath,
						},
					},
				},
			};

		case "claude-code":
		case "claude-desktop":
			return {
				mcpServers: {
					"astrolabe-task": {
						command: "node",
						args: [mcpServerPath],
						env: {
							DATABASE_PATH: absoluteDbPath,
						},
					},
				},
			};

		default:
			throw new Error(`Unsupported editor: ${editor}`);
	}
}

// Get configuration file path for different editors
function getConfigFilePath(editor: string): string {
	switch (editor) {
		case "cursor":
			return ".cursor/mcp.json";
		case "roo":
			return ".roo/mcp.json";
		case "cline":
			return ".vscode/mcp.json"; // Cline uses VS Code's MCP configuration
		case "claude-code":
		case "claude-desktop":
			// Claude Desktop uses platform-specific paths
			const os = process.platform;
			if (os === "darwin") {
				return (
					process.env["HOME"] +
					"/Library/Application Support/Claude/claude_desktop_config.json"
				);
			} else if (os === "win32") {
				return process.env["APPDATA"] + "\\Claude\\claude_desktop_config.json";
			}
			return "claude_desktop_config.json"; // fallback
		default:
			throw new Error(`Unsupported editor: ${editor}`);
	}
}

// Create initial starter tasks
async function createStarterTasks(store: any): Promise<string[]> {
	const starterTasks = [
		{
			title: "Improve documentation",
			description:
				"Review and enhance project documentation for clarity and completeness",
		},
		{
			title: "Set up development environment",
			description:
				"Configure local development environment with necessary tools and dependencies",
		},
		{
			title: "Review and organize codebase",
			description:
				"Analyze current codebase structure and identify areas for improvement",
		},
	];

	const createdTasks: string[] = [];

	for (const task of starterTasks) {
		try {
			const newTask = await store.addTask({
				title: task.title,
				description: task.description,
				status: "pending" as const,
				priority: "medium" as const,
			});
			createdTasks.push(`${newTask.id}: ${newTask.title}`);
		} catch (error) {
			console.warn(`Failed to create starter task "${task.title}":`, error);
		}
	}

	return createdTasks;
}

// Interactive prompt component
function InteractivePrompts({
	onComplete,
}: { onComplete: (options: InteractiveOptions) => void }) {
	const [promptState, setPromptState] = useState<PromptState>({
		currentStep: "editor",
	});
	const [databaseInput, setDatabaseInput] = useState("");

	const editorOptions = [
		{ label: "Cursor - AI-powered code editor", value: "cursor" },
		{ label: "Roo - Terminal-based editor", value: "roo" },
		{ label: "Cline - VSCode extension", value: "cline" },
		{
			label: "Claude for Code - Anthropic's coding assistant",
			value: "claude-code",
		},
		{
			label: "Claude Desktop - Anthropic's desktop app",
			value: "claude-desktop",
		},
	];

	const forceOptions = [
		{ label: "No - Only create new configuration", value: false },
		{ label: "Yes - Overwrite existing configuration", value: true },
	];

	const handleEditorSelect = (item: any) => {
		setPromptState((prev) => ({
			...prev,
			editor: item.value,
			currentStep: "database",
		}));
	};

	const handleDatabaseSubmit = (value: string) => {
		const databasePath = value.trim() || "./data/astrolabe.db";
		setPromptState((prev) => ({ ...prev, databasePath, currentStep: "force" }));
	};

	const handleForceSelect = (item: any) => {
		const updatedState = {
			...promptState,
			force: item.value,
			currentStep: "complete" as const,
		};
		setPromptState(updatedState);

		// Complete the prompting process
		onComplete({
			editor: updatedState.editor as any,
			databasePath: updatedState.databasePath!,
			force: updatedState.force!,
		});
	};

	if (promptState.currentStep === "editor") {
		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					🚀 Welcome to Astrolabe Setup!
				</Text>
				<Text color="gray">Let's configure your task management system.</Text>
				<Text></Text>
				<Text bold>Choose your editor/IDE:</Text>
				<SelectInput items={editorOptions} onSelect={handleEditorSelect} />
			</Box>
		);
	}

	if (promptState.currentStep === "database") {
		return (
			<Box flexDirection="column">
				<Text bold color="green">
					✓ Editor: {promptState.editor}
				</Text>
				<Text></Text>
				<Text bold>Database file path (press Enter for default):</Text>
				<Text color="gray">Default: ./data/astrolabe.db</Text>
				<TextInput
					value={databaseInput}
					placeholder="./data/astrolabe.db"
					onChange={setDatabaseInput}
					onSubmit={handleDatabaseSubmit}
				/>
			</Box>
		);
	}

	if (promptState.currentStep === "force") {
		return (
			<Box flexDirection="column">
				<Text bold color="green">
					✓ Editor: {promptState.editor}
				</Text>
				<Text bold color="green">
					✓ Database: {promptState.databasePath}
				</Text>
				<Text></Text>
				<Text bold>Overwrite existing configuration files?</Text>
				<SelectInput items={forceOptions} onSelect={handleForceSelect} />
			</Box>
		);
	}

	return <Text>Processing...</Text>;
}

export default function Init({ options }: Props) {
	const [result, setResult] = useState<InitResult | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [showInteractive, setShowInteractive] = useState(false);
	const [finalOptions, setFinalOptions] = useState<InteractiveOptions | null>(
		null,
	);

	// Check if we need to show interactive prompts
	useEffect(() => {
		if (!options.editor) {
			setShowInteractive(true);
			setIsLoading(false);
		} else {
			// We have all required options, proceed directly
			setFinalOptions({
				editor: options.editor,
				databasePath: options["database-path"] || "./data/astrolabe.db",
				force: options.force || false,
			});
		}
	}, [options]);

	const handleInteractiveComplete = (
		interactiveOptions: InteractiveOptions,
	) => {
		setFinalOptions(interactiveOptions);
		setShowInteractive(false);
		setIsLoading(true);
	};

	useEffect(() => {
		if (!finalOptions) return;

		async function runInit() {
			try {
				const databasePath = finalOptions!.databasePath;
				const mcpServerPath = getMcpServerPath();

				// Step 1: Generate MCP configuration and check if file exists
				const config = generateMcpConfig(
					finalOptions!.editor,
					mcpServerPath,
					databasePath,
				);
				const configPath = getConfigFilePath(finalOptions!.editor);

				// Step 2: Check if config file already exists
				let configExists = false;
				try {
					await access(configPath);
					configExists = true;
				} catch {
					// File doesn't exist, which is fine
				}

				if (configExists && !finalOptions!.force) {
					setResult({
						success: false,
						message: `Configuration file ${configPath} already exists. Use --force to overwrite.`,
					});
					return;
				}

				// Step 3: Initialize database
				const store = await createDatabase({
					dataDir: databasePath,
					verbose: true,
					enableLocking: true,
					lockOptions: {
						processType: "cli-init", // Identify this as CLI init process
					},
				});

				// Step 4: Create initial tasks
				const createdTasks = await createStarterTasks(store);

				// Step 5: Create configuration directory and file
				const configDir = dirname(configPath);
				if (configDir !== ".") {
					await mkdir(configDir, { recursive: true });
				}

				await writeFile(configPath, JSON.stringify(config, null, 2));

				// Step 6: Close database connection
				await store.close();

				setResult({
					success: true,
					message: `Repository initialized successfully for ${finalOptions!.editor}!`,
					details: [
						`Database: ${resolve(databasePath)}`,
						`Configuration: ${resolve(configPath)}`,
						`MCP Server: ${mcpServerPath}`,
						`Created ${createdTasks.length} starter tasks:`,
						...createdTasks.map((task) => `  - ${task}`),
					],
				});
			} catch (error) {
				setResult({
					success: false,
					message: `Failed to initialize repository: ${error instanceof Error ? error.message : "Unknown error"}`,
				});
			} finally {
				setIsLoading(false);
			}
		}

		runInit();
	}, [finalOptions]);

	if (showInteractive) {
		return <InteractivePrompts onComplete={handleInteractiveComplete} />;
	}

	if (isLoading) {
		return (
			<Box flexDirection="column">
				<Text color="cyan">🚀 Initializing Astrolabe repository...</Text>
				<Text color="gray">Setting up database and MCP configuration...</Text>
			</Box>
		);
	}

	if (!result) {
		return <Text color="red">Unexpected error occurred</Text>;
	}

	return (
		<Box flexDirection="column" gap={1}>
			<Text color={result.success ? "green" : "red"}>
				{result.success ? "✅" : "❌"} {result.message}
			</Text>

			{result.details && (
				<Box flexDirection="column" paddingLeft={2}>
					{result.details.map((detail, index) => (
						<Text key={index} color="gray">
							{detail}
						</Text>
					))}
				</Box>
			)}

			{result.success && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold color="cyan">
						Next Steps:
					</Text>
					<Box flexDirection="column" paddingLeft={2}>
						<Text color="gray">
							• Restart your editor to load the MCP configuration
						</Text>
						<Text color="gray">
							• Run "astrolabe task list" to see your starter tasks
						</Text>
						<Text color="gray">• Begin working with "astrolabe task next"</Text>
					</Box>
				</Box>
			)}
		</Box>
	);
}
