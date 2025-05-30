import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

interface Command {
	name: string;
	description: string;
	pattern: RegExp;
	execute: (matches: RegExpMatchArray) => Promise<void>;
}

export class CommandPalette {
	private box: blessed.Widgets.BoxElement;
	private input: blessed.Widgets.TextboxElement;
	private results: blessed.Widgets.ListElement;
	private commands: Command[];
	private unsubscribe: () => void;

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		// Create the container
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
		});

		// Create input field
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

		// Create results list
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

		// Initialize commands
		this.commands = this.createCommands();

		this.setupEventHandlers();

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			if (state.commandPaletteOpen && this.box.hidden) {
				this.show();
			} else if (!state.commandPaletteOpen && !this.box.hidden) {
				this.hide();
			}
		});
	}

	private createCommands(): Command[] {
		const state = () => this.store.getState();

		return [
			{
				name: "add task",
				description: "Add a new task",
				pattern: /^add\s+"([^"]+)"(?:\s+under\s+(\S+))?$/,
				execute: async (matches) => {
					const title = matches[1] || "";
					const parentId = matches[2] || null;
					await state().addTask(parentId, title);
					state().toggleCommandPalette();
				},
			},
			{
				name: "add task editor",
				description: "Add a new task using editor",
				pattern: /^add\s+editor(?:\s+under\s+(\S+))?$/,
				execute: async (matches) => {
					const parentId = matches[1] || null;
					await state().addTaskWithEditor(parentId);
					state().toggleCommandPalette();
				},
			},
			{
				name: "rename task",
				description: "Rename a task by ID",
				pattern: /^rename\s+(\S+)\s+"([^"]+)"$/,
				execute: async (matches) => {
					const taskId = matches[1] || "";
					const newTitle = matches[2] || "";
					await state().renameTask(taskId, newTitle);
					state().toggleCommandPalette();
				},
			},
			{
				name: "edit task",
				description: "Edit a task with editor by ID",
				pattern: /^edit\s+(\S+)$/,
				execute: async (matches) => {
					const taskId = matches[1] || "";
					await state().editTaskWithEditor(taskId);
					state().toggleCommandPalette();
				},
			},
			{
				name: "delete task",
				description: "Delete a task by ID",
				pattern: /^delete\s+(\S+)$/,
				execute: async (matches) => {
					const taskId = matches[1] || "";
					await state().deleteTask(taskId);
					state().toggleCommandPalette();
				},
			},
			{
				name: "move task",
				description: "Move a task to a new parent",
				pattern: /^move\s+(\S+)\s+to\s+(\S+)$/,
				execute: async (_matches) => {
					// Not implemented yet
					state().setStatusMessage("Move task not implemented yet");
					state().toggleCommandPalette();
				},
			},
			{
				name: "dep add",
				description: "Add dependency between tasks",
				pattern: /^dep\s+(\S+)\s+->\s+(\S+)$/,
				execute: async (matches) => {
					const taskId = matches[1] || "";
					const dependsOnId = matches[2] || "";
					await state().addDependency(taskId, dependsOnId);
					state().toggleCommandPalette();
				},
			},
			{
				name: "dep remove",
				description: "Remove dependency between tasks",
				pattern: /^undep\s+(\S+)\s+->\s+(\S+)$/,
				execute: async (matches) => {
					const taskId = matches[1] || "";
					const dependsOnId = matches[2] || "";
					await state().removeDependency(taskId, dependsOnId);
					state().toggleCommandPalette();
				},
			},
			{
				name: "expand all",
				description: "Expand all task nodes",
				pattern: /^expand\s+all$/,
				execute: async () => {
					state().expandAll();
					state().toggleCommandPalette();
				},
			},
			{
				name: "collapse all",
				description: "Collapse all task nodes",
				pattern: /^collapse\s+all$/,
				execute: async () => {
					state().collapseAll();
					state().toggleCommandPalette();
				},
			},
		];
	}

	private setupEventHandlers() {
		// Handle input changes
		this.input.on("submit", (value) => {
			this.executeCommand(value);
		});

		this.input.on("cancel", () => {
			this.store.getState().toggleCommandPalette();
		});

		this.input.key(["up", "down"], (_ch, key) => {
			if (key.name === "up") {
				(this.results as any).up(1);
			} else {
				(this.results as any).down(1);
			}
			this.results.screen.render();
		});

		// Update suggestions on input change
		const updateSuggestions = () => {
			const value = this.input.getValue();
			this.updateSuggestions(value);
		};

		this.input.on("keypress", () => {
			process.nextTick(updateSuggestions);
		});
	}

	private updateSuggestions(input: string) {
		const suggestions: string[] = [];

		// Show all commands if input is empty
		if (!input) {
			this.commands.forEach((cmd) => {
				suggestions.push(`${cmd.name} - ${cmd.description}`);
			});
		} else {
			// Try to match commands
			this.commands.forEach((cmd) => {
				if (cmd.pattern.test(input)) {
					suggestions.push(`✓ ${cmd.name} - Press Enter to execute`);
				} else if (cmd.name.includes(input.toLowerCase())) {
					suggestions.push(`${cmd.name} - ${cmd.description}`);
				}
			});
		}

		this.results.setItems(suggestions);
		this.results.screen.render();
	}

	private executeCommand(input: string) {
		for (const cmd of this.commands) {
			const matches = input.match(cmd.pattern);
			if (matches) {
				cmd.execute(matches).catch((err) => {
					this.store.getState().setStatusMessage(`Error: ${err.message}`);
				});
				return;
			}
		}

		// No matching command
		this.store.getState().setStatusMessage(`Unknown command: ${input}`);
		this.store.getState().toggleCommandPalette();
	}

	show() {
		this.box.show();
		this.input.clearValue();
		this.input.focus();
		this.updateSuggestions("");
		this.box.screen.render();
	}

	hide() {
		this.box.hide();
		this.box.screen.render();
	}

	focus() {
		this.input.focus();
	}

	destroy() {
		this.unsubscribe();
		this.box.destroy();
	}
}
