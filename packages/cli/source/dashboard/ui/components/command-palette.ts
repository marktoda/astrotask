import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

interface Command {
	name: string;
	description: string;
	pattern: RegExp;
	execute: (matches: RegExpMatchArray) => Promise<void>;
}

interface CommandPaletteState {
	isVisible: boolean;
	isDestroyed: boolean;
	isInitialized: boolean;
}

export class CommandPalette {
	private box: blessed.Widgets.BoxElement | null = null;
	private input: blessed.Widgets.TextboxElement | null = null;
	private results: blessed.Widgets.ListElement | null = null;
	private commands: Command[] = [];
	private unsubscribe: (() => void) | null = null;
	private state: CommandPaletteState = {
		isVisible: false,
		isDestroyed: false,
		isInitialized: false,
	};

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		try {
			this.initialize();
		} catch (error) {
			console.error("Failed to initialize CommandPalette:", error);
			this.safeCleanup();
		}
	}

	private initialize(): void {
		if (!this.parent || !this.store) {
			throw new Error("Invalid parent or store provided to CommandPalette");
		}

		this.createUI();
		this.commands = this.createCommands();
		this.setupEventHandlers();
		this.subscribeToStore();
		this.state.isInitialized = true;
	}

	private createUI(): void {
		// Create the container with error boundaries
		this.box = blessed.box({
			parent: this.parent,
			top: "center",
			left: "center",
			width: "50%",
			height: "50%",
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "yellow",
				},
				bg: "black",
			},
			hidden: true,
			tags: true,
		});

		if (!this.box) {
			throw new Error("Failed to create command palette container");
		}

		// Create input field with validation
		this.input = blessed.textbox({
			parent: this.box,
			top: 0,
			left: 0,
			right: 0,
			height: 3,
			label: " Command ",
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "yellow",
				},
			},
			inputOnFocus: true,
		});

		if (!this.input) {
			throw new Error("Failed to create command palette input");
		}

		// Create results list with validation
		this.results = blessed.list({
			parent: this.box,
			top: 3,
			left: 0,
			right: 0,
			bottom: 0,
			style: {
				selected: {
					bg: "blue",
					fg: "black",
					bold: true,
				},
			},
			keys: true,
			mouse: true,
			scrollable: true,
			alwaysScroll: true,
		});

		if (!this.results) {
			throw new Error("Failed to create command palette results list");
		}
	}

	private createCommands(): Command[] {
		if (!this.store) {
			return [];
		}

		const state = () => {
			try {
				return this.store.getState();
			} catch (error) {
				console.error("Failed to get store state:", error);
				return null;
			}
		};

		return [
			// Task creation commands
			{
				name: "add task",
				description: "Add a new task",
				pattern: /^add\s+"([^"]+)"(?:\s+under\s+([^\s]+))?$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const title = matches[1]?.trim() || "";
					const parentId = matches[2]?.trim() || null;

					if (!title) {
						stateData.setStatusMessage("Error: Task title cannot be empty");
						return;
					}

					try {
						await stateData.addTask(parentId, title);
						stateData.setStatusMessage(`Task "${title}" added successfully`);
					} catch (error) {
						stateData.setStatusMessage(
							`Error adding task: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "add task editor",
				description: "Add a new task using editor",
				pattern: /^add\s+editor(?:\s+under\s+([^\s]+))?$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const parentId = matches[1]?.trim() || null;

					try {
						await stateData.addTaskWithEditor(parentId);
					} catch (error) {
						stateData.setStatusMessage(
							`Error opening editor: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},

			// Task editing commands
			{
				name: "rename task",
				description: "Rename a task by ID",
				pattern: /^rename\s+([^\s]+)\s+"([^"]+)"$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";
					const newTitle = matches[2]?.trim() || "";

					if (!taskId || !newTitle) {
						stateData.setStatusMessage("Error: Task ID and title are required");
						return;
					}

					try {
						await stateData.renameTask(taskId, newTitle);
						stateData.setStatusMessage(`Task "${taskId}" renamed successfully`);
					} catch (error) {
						stateData.setStatusMessage(
							`Error renaming task: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "edit task",
				description: "Edit a task with editor by ID",
				pattern: /^edit\s+([^\s]+)$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";

					if (!taskId) {
						stateData.setStatusMessage("Error: Task ID is required");
						return;
					}

					try {
						await stateData.editTaskWithEditor(taskId);
					} catch (error) {
						stateData.setStatusMessage(
							`Error editing task: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "delete task",
				description: "Delete a task by ID",
				pattern: /^delete\s+([^\s]+)$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";

					if (!taskId) {
						stateData.setStatusMessage("Error: Task ID is required");
						return;
					}

					try {
						stateData.deleteTask(taskId);
						// Status message is already set by deleteTask
					} catch (error) {
						stateData.setStatusMessage(
							`Error deleting task: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},

			// Status update commands
			{
				name: "status pending",
				description: "Set task status to pending",
				pattern: /^status\s+([^\s]+)\s+pending$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";

					if (!taskId) {
						stateData.setStatusMessage("Error: Task ID is required");
						return;
					}

					try {
						stateData.updateTaskStatus(taskId, "pending");
						stateData.setStatusMessage(
							`Task "${taskId}" status set to pending`,
						);
					} catch (error) {
						stateData.setStatusMessage(
							`Error updating status: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "status in-progress",
				description: "Set task status to in-progress",
				pattern: /^status\s+([^\s]+)\s+(?:in-progress|progress|active)$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";

					if (!taskId) {
						stateData.setStatusMessage("Error: Task ID is required");
						return;
					}

					try {
						stateData.updateTaskStatus(taskId, "in-progress");
						stateData.setStatusMessage(
							`Task "${taskId}" status set to in-progress`,
						);
					} catch (error) {
						stateData.setStatusMessage(
							`Error updating status: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "status done",
				description: "Set task status to done",
				pattern: /^status\s+([^\s]+)\s+(?:done|complete|finished)$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";

					if (!taskId) {
						stateData.setStatusMessage("Error: Task ID is required");
						return;
					}

					try {
						stateData.updateTaskStatus(taskId, "done");
						stateData.setStatusMessage(`Task "${taskId}" status set to done`);
					} catch (error) {
						stateData.setStatusMessage(
							`Error updating status: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "status cancelled",
				description: "Set task status to cancelled",
				pattern: /^status\s+([^\s]+)\s+(?:cancelled|canceled|cancel)$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";

					if (!taskId) {
						stateData.setStatusMessage("Error: Task ID is required");
						return;
					}

					try {
						stateData.updateTaskStatus(taskId, "cancelled");
						stateData.setStatusMessage(
							`Task "${taskId}" status set to cancelled`,
						);
					} catch (error) {
						stateData.setStatusMessage(
							`Error updating status: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},

			// Navigation commands
			{
				name: "select task",
				description: "Select a task by ID",
				pattern: /^(?:select|goto|go)\s+([^\s]+)$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";

					if (!taskId) {
						stateData.setStatusMessage("Error: Task ID is required");
						return;
					}

					try {
						stateData.selectTask(taskId);
						stateData.setStatusMessage(`Selected task "${taskId}"`);
					} catch (error) {
						stateData.setStatusMessage(
							`Error selecting task: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "focus sidebar",
				description: "Focus on the project sidebar",
				pattern: /^(?:focus|panel)\s+(?:sidebar|projects?)$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.setActivePanel("sidebar");
						stateData.setStatusMessage("Focused on project sidebar");
					} catch (error) {
						stateData.setStatusMessage(
							`Error focusing sidebar: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "focus tree",
				description: "Focus on the task tree",
				pattern: /^(?:focus|panel)\s+(?:tree|tasks?)$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.setActivePanel("tree");
						stateData.setStatusMessage("Focused on task tree");
					} catch (error) {
						stateData.setStatusMessage(
							`Error focusing tree: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "focus details",
				description: "Focus on the details panel",
				pattern: /^(?:focus|panel)\s+(?:details?|info)$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.setActivePanel("details");
						stateData.setStatusMessage("Focused on details panel");
					} catch (error) {
						stateData.setStatusMessage(
							`Error focusing details: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},

			// View commands
			{
				name: "toggle completed",
				description: "Toggle visibility of completed tasks",
				pattern: /^(?:toggle|show|hide)\s+(?:completed?|done)$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.toggleShowCompletedTasks();
						const newState = stateData;
						const statusText = newState.showCompletedTasks
							? "Showing completed tasks"
							: "Hiding completed tasks";
						stateData.setStatusMessage(statusText);
					} catch (error) {
						stateData.setStatusMessage(
							`Error toggling completed tasks: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "toggle detail view",
				description: "Toggle detail view mode",
				pattern: /^(?:toggle|switch)\s+(?:detail|view)\s*(?:mode)?$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.toggleDetailViewMode();
						stateData.setStatusMessage("Toggled detail view mode");
					} catch (error) {
						stateData.setStatusMessage(
							`Error toggling detail view: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "toggle tree view",
				description: "Toggle tree view mode",
				pattern: /^(?:toggle|switch)\s+(?:tree)\s*(?:mode)?$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.toggleTreeViewMode();
						stateData.setStatusMessage("Toggled tree view mode");
					} catch (error) {
						stateData.setStatusMessage(
							`Error toggling tree view: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},

			// Task movement and organization
			{
				name: "move task",
				description: "Move a task to a new parent",
				pattern: /^move\s+([^\s]+)\s+to\s+([^\s]+)$/,
				execute: async (_matches) => {
					const stateData = state();
					if (!stateData) return;

					// Not implemented yet
					stateData.setStatusMessage("Move task not implemented yet");
					stateData.toggleCommandPalette();
				},
			},

			// Dependency commands
			{
				name: "dep add",
				description: "Add dependency between tasks",
				pattern: /^dep\s+([^\s]+)\s+->\s+([^\s]+)$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";
					const dependsOnId = matches[2]?.trim() || "";

					if (!taskId || !dependsOnId) {
						stateData.setStatusMessage("Error: Both task IDs are required");
						return;
					}

					try {
						await stateData.addDependency(taskId, dependsOnId);
						stateData.setStatusMessage(
							`Dependency added: ${taskId} -> ${dependsOnId}`,
						);
					} catch (error) {
						stateData.setStatusMessage(
							`Error adding dependency: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "dep remove",
				description: "Remove dependency between tasks",
				pattern: /^undep\s+([^\s]+)\s+->\s+([^\s]+)$/,
				execute: async (matches) => {
					const stateData = state();
					if (!stateData) return;

					const taskId = matches[1]?.trim() || "";
					const dependsOnId = matches[2]?.trim() || "";

					if (!taskId || !dependsOnId) {
						stateData.setStatusMessage("Error: Both task IDs are required");
						return;
					}

					try {
						await stateData.removeDependency(taskId, dependsOnId);
						stateData.setStatusMessage(
							`Dependency removed: ${taskId} -> ${dependsOnId}`,
						);
					} catch (error) {
						stateData.setStatusMessage(
							`Error removing dependency: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},

			// Tree operations
			{
				name: "expand all",
				description: "Expand all task nodes",
				pattern: /^expand\s+all$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.expandAll();
						stateData.setStatusMessage("All tasks expanded");
					} catch (error) {
						stateData.setStatusMessage(
							`Error expanding tasks: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "collapse all",
				description: "Collapse all task nodes",
				pattern: /^collapse\s+all$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.collapseAll();
						stateData.setStatusMessage("All tasks collapsed");
					} catch (error) {
						stateData.setStatusMessage(
							`Error collapsing tasks: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},

			// Data operations
			{
				name: "reload",
				description: "Reload data from database",
				pattern: /^(?:reload|refresh|sync)$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						await stateData.reloadFromDatabase();
						stateData.setStatusMessage("Data reloaded successfully");
					} catch (error) {
						stateData.setStatusMessage(
							`Error reloading data: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "save",
				description: "Save changes to database",
				pattern: /^(?:save|flush)$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						await stateData.flushChanges();
						stateData.setStatusMessage("Changes saved successfully");
					} catch (error) {
						stateData.setStatusMessage(
							`Error saving changes: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},

			// Help and information
			{
				name: "help",
				description: "Show help overlay",
				pattern: /^(?:help|\?)$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.toggleHelpOverlay();
						stateData.setStatusMessage("Help overlay toggled");
					} catch (error) {
						stateData.setStatusMessage(
							`Error showing help: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
			{
				name: "commands",
				description: "List all available commands",
				pattern: /^(?:commands?|list)$/,
				execute: async () => {
					const stateData = state();
					if (!stateData) return;

					try {
						stateData.setStatusMessage(
							`Available commands: ${this.commands.length} total`,
						);
						// Note: In a real implementation, you might want to show this in a separate overlay
					} catch (error) {
						stateData.setStatusMessage(
							`Error listing commands: ${error instanceof Error ? error.message : String(error)}`,
						);
					} finally {
						stateData.toggleCommandPalette();
					}
				},
			},
		];
	}

	private setupEventHandlers(): void {
		if (!this.input || !this.results) {
			console.error(
				"Cannot setup event handlers: input or results not initialized",
			);
			return;
		}

		try {
			// Handle input submission with error boundary
			this.input.on("submit", (value) => {
				try {
					this.executeCommand(value || "");
				} catch (error) {
					console.error("Error in input submit handler:", error);
					this.safeSetStatusMessage(
						`Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			});

			// Handle cancellation
			this.input.on("cancel", () => {
				try {
					this.safeToggleCommandPalette();
				} catch (error) {
					console.error("Error in input cancel handler:", error);
				}
			});

			// Handle navigation keys
			this.input.key(["up", "down"], (_ch, key) => {
				try {
					if (!this.results) return;

					if (key.name === "up") {
						(this.results as any).up(1);
					} else {
						(this.results as any).down(1);
					}

					if (this.results.screen) {
						this.results.screen.render();
					}
				} catch (error) {
					console.error("Error in key navigation handler:", error);
				}
			});

			// Update suggestions on input change with debouncing
			let updateTimeout: NodeJS.Timeout;
			const updateSuggestions = () => {
				clearTimeout(updateTimeout);
				updateTimeout = setTimeout(() => {
					try {
						if (!this.input) return;
						const value = this.input.getValue() || "";
						this.updateSuggestions(value);
					} catch (error) {
						console.error("Error updating suggestions:", error);
					}
				}, 100); // Debounce for 100ms
			};

			this.input.on("keypress", updateSuggestions);
		} catch (error) {
			console.error("Error setting up event handlers:", error);
		}
	}

	private subscribeToStore(): void {
		if (!this.store) {
			console.error("Cannot subscribe to store: store not initialized");
			return;
		}

		try {
			let updateTimeout: NodeJS.Timeout;

			this.unsubscribe = this.store.subscribe((state) => {
				// Debounce store updates to prevent rapid changes
				clearTimeout(updateTimeout);
				updateTimeout = setTimeout(() => {
					try {
						if (this.state.isDestroyed) return;

						// Prevent infinite loops by checking if visibility state actually changed
						const shouldBeVisible = state.commandPaletteOpen;
						const currentlyVisible = this.state.isVisible;

						if (shouldBeVisible && !currentlyVisible) {
							this.show();
						} else if (!shouldBeVisible && currentlyVisible) {
							this.hide();
						}
					} catch (error) {
						console.error("Error in store subscription:", error);
					}
				}, 10); // Short debounce to prevent rapid updates
			});
		} catch (error) {
			console.error("Error subscribing to store:", error);
		}
	}

	private updateSuggestions(input: string): void {
		if (!this.results) {
			console.error("Cannot update suggestions: results not initialized");
			return;
		}

		try {
			const suggestions: string[] = [];

			// Show all commands if input is empty
			if (!input.trim()) {
				this.commands.forEach((cmd) => {
					suggestions.push(`${cmd.name} - ${cmd.description}`);
				});
			} else {
				// Try to match commands
				this.commands.forEach((cmd) => {
					try {
						if (cmd.pattern.test(input)) {
							suggestions.push(`✓ ${cmd.name} - Press Enter to execute`);
						} else if (cmd.name.toLowerCase().includes(input.toLowerCase())) {
							suggestions.push(`${cmd.name} - ${cmd.description}`);
						}
					} catch (patternError) {
						console.error(
							`Error testing pattern for command ${cmd.name}:`,
							patternError,
						);
					}
				});

				if (suggestions.length === 0) {
					suggestions.push("No matching commands found");
				}
			}

			this.results.setItems(suggestions);

			if (this.results.screen) {
				this.results.screen.render();
			}
		} catch (error) {
			console.error("Error updating suggestions:", error);
		}
	}

	private executeCommand(input: string): void {
		if (!input.trim()) {
			this.safeSetStatusMessage("Empty command");
			this.safeToggleCommandPalette();
			return;
		}

		let commandFound = false;

		for (const cmd of this.commands) {
			try {
				const matches = input.match(cmd.pattern);
				if (matches) {
					commandFound = true;
					cmd.execute(matches).catch((err) => {
						const errorMessage =
							err instanceof Error ? err.message : String(err);
						console.error(`Error executing command ${cmd.name}:`, err);
						this.safeSetStatusMessage(`Command failed: ${errorMessage}`);
					});
					return;
				}
			} catch (error) {
				console.error(`Error matching pattern for command ${cmd.name}:`, error);
			}
		}

		if (!commandFound) {
			this.safeSetStatusMessage(`Unknown command: ${input}`);
			this.safeToggleCommandPalette();
		}
	}

	private safeSetStatusMessage(message: string): void {
		try {
			const state = this.store?.getState();
			if (state?.setStatusMessage) {
				state.setStatusMessage(message);
			}
		} catch (error) {
			console.error("Error setting status message:", error);
		}
	}

	private safeToggleCommandPalette(): void {
		try {
			const state = this.store?.getState();
			if (state?.toggleCommandPalette) {
				state.toggleCommandPalette();
			}
		} catch (error) {
			console.error("Error toggling command palette:", error);
		}
	}

	show(): void {
		if (this.state.isDestroyed || !this.state.isInitialized) {
			console.error("Cannot show command palette: not properly initialized");
			return;
		}

		// Prevent double-showing
		if (this.state.isVisible) {
			return;
		}

		try {
			if (!this.box || !this.input) {
				console.error(
					"Cannot show command palette: UI components not initialized",
				);
				return;
			}

			this.box.show();
			this.input.clearValue();
			this.updateSuggestions("");
			this.state.isVisible = true;

			if (this.box.screen) {
				this.box.screen.render();
			}

			// Focus after a brief delay to prevent recursion
			setTimeout(() => {
				if (!this.state.isDestroyed && this.state.isVisible && this.input) {
					try {
						this.input.focus();
					} catch (focusError) {
						console.error("Error focusing after show:", focusError);
					}
				}
			}, 50);
		} catch (error) {
			console.error("Error showing command palette:", error);
		}
	}

	hide(): void {
		if (this.state.isDestroyed) {
			return;
		}

		// Prevent double-hiding
		if (!this.state.isVisible) {
			return;
		}

		try {
			if (this.box) {
				this.box.hide();
				this.state.isVisible = false;

				if (this.box.screen) {
					this.box.screen.render();
				}
			}
		} catch (error) {
			console.error("Error hiding command palette:", error);
		}
	}

	focus(): void {
		if (
			this.state.isDestroyed ||
			!this.state.isInitialized ||
			!this.state.isVisible
		) {
			return;
		}

		try {
			if (this.input && typeof this.input.focus === "function") {
				// Add a small delay to prevent focus recursion issues with blessed
				setTimeout(() => {
					try {
						if (!this.state.isDestroyed && this.input) {
							this.input.focus();
						}
					} catch (focusError) {
						console.error("Error in delayed focus:", focusError);
					}
				}, 10);
			}
		} catch (error) {
			console.error("Error focusing command palette:", error);
		}
	}

	private safeCleanup(): void {
		try {
			this.state.isDestroyed = true;

			if (this.unsubscribe) {
				this.unsubscribe();
				this.unsubscribe = null;
			}

			if (this.box) {
				this.box.destroy();
				this.box = null;
			}

			this.input = null;
			this.results = null;
			this.commands = [];
		} catch (error) {
			console.error("Error during cleanup:", error);
		}
	}

	destroy(): void {
		this.safeCleanup();
	}
}
