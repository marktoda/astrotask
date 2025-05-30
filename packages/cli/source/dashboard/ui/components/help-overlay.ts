import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

interface KeyBinding {
	keys: string[];
	description: string;
}

interface Section {
	title: string;
	bindings: KeyBinding[];
}

export class HelpOverlay {
	private box: blessed.Widgets.BoxElement;
	private content: blessed.Widgets.TextElement;
	private unsubscribe: () => void;

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		// Create the overlay box
		this.box = blessed.box({
			parent: this.parent,
			top: "center",
			left: "center",
			width: "70%",
			height: "80%",
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "cyan",
				},
				bg: "black",
			},
			label: " Help - Key Bindings ",
			hidden: true,
		});

		// Create scrollable content
		this.content = blessed.text({
			parent: this.box,
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			scrollable: true,
			keys: true,
			mouse: true,
			padding: 1,
			tags: true, // Enable blessed tag parsing
			style: {
				scrollbar: {
					bg: "gray",
				},
			},
		});

		// Set up content
		this.setContent();

		// Handle escape key
		this.box.key(["escape", "q", "?"], () => {
			this.store.getState().toggleHelpOverlay();
		});

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			if (state.helpOverlayOpen && this.box.hidden) {
				this.show();
			} else if (!state.helpOverlayOpen && !this.box.hidden) {
				this.hide();
			}
		});
	}

	private setContent() {
		const sections: Section[] = [
			{
				title: "Global",
				bindings: [
					{
						keys: ["q", "Ctrl+c"],
						description: "Quit application (double tap)",
					},
					{ keys: ["?"], description: "Show/hide this help" },
					{ keys: [":"], description: "Open command palette" },
					{ keys: ["Tab"], description: "Focus next panel" },
					{ keys: ["Shift+Tab"], description: "Focus previous panel" },
				],
			},
			{
				title: "Task Tree Navigation",
				bindings: [
					{ keys: ["↑", "k"], description: "Move cursor up" },
					{ keys: ["↓", "j"], description: "Move cursor down" },
					{ keys: ["←", "h"], description: "Collapse node" },
					{ keys: ["→", "l"], description: "Expand node" },
					{ keys: ["g"], description: "Go to top" },
					{ keys: ["G"], description: "Go to bottom" },
					{ keys: ["f"], description: "Focus on task (set as tree root)" },
					{ keys: ["Esc", "u"], description: "Reset to show all projects" },
				],
			},
			{
				title: "Task Operations",
				bindings: [
					{ keys: ["Enter", "Space"], description: "Toggle task completion" },
					{ keys: ["a"], description: "Add sibling task with editor" },
					{ keys: ["A"], description: "Add child task with editor" },
					{ keys: ["r"], description: "Rename task" },
					{ keys: ["e"], description: "Edit task with editor" },
					{ keys: ["D"], description: "Delete task (with confirmation)" },
					{ keys: ["d"], description: "Toggle dependency tree view" },
					{ keys: ["b"], description: "Add dependency" },
					{ keys: ["B"], description: "Remove dependency" },
					{ keys: ["*"], description: "Expand all nodes" },
					{ keys: ["_"], description: "Collapse all nodes" },
				],
			},
			{
				title: "Project Sidebar",
				bindings: [
					{
						keys: ["Enter", "Click"],
						description: "Select project and switch to tree",
					},
					{ keys: ["↑", "k"], description: "Move up" },
					{ keys: ["↓", "j"], description: "Move down" },
					{ keys: ["PgUp"], description: "Page up" },
					{ keys: ["PgDn"], description: "Page down" },
				],
			},
			{
				title: "Task Details",
				bindings: [
					{ keys: ["g"], description: "Toggle dependency graph view" },
					{ keys: ["↑", "k"], description: "Scroll up" },
					{ keys: ["↓", "j"], description: "Scroll down" },
				],
			},
			{
				title: "Command Palette",
				bindings: [
					{ keys: ['add "title"'], description: "Add new task" },
					{
						keys: ['add "title" under ID'],
						description: "Add task under parent",
					},
					{ keys: ["add editor"], description: "Add new task with editor" },
					{
						keys: ["add editor under ID"],
						description: "Add task with editor under parent",
					},
					{ keys: ['rename ID "new title"'], description: "Rename task by ID" },
					{ keys: ["edit ID"], description: "Edit task with editor by ID" },
					{ keys: ["delete ID"], description: "Delete task by ID" },
					{ keys: ["dep ID -> ID"], description: "Add dependency" },
					{ keys: ["undep ID -> ID"], description: "Remove dependency" },
					{ keys: ["expand all"], description: "Expand all tasks" },
					{ keys: ["collapse all"], description: "Collapse all tasks" },
				],
			},
		];

		const lines: string[] = [];

		// Header - use blessed tags for styling
		lines.push("{bold}{cyan-fg}Astrolabe Terminal UI - Keyboard Shortcuts{/}");
		lines.push("");
		lines.push("{gray-fg}Press ? or q to close this help{/}");
		lines.push("");

		// Sections
		sections.forEach((section) => {
			lines.push(`{bold}{yellow-fg}${section.title}{/}`);
			lines.push("{gray-fg}" + "─".repeat(40) + "{/}");

			section.bindings.forEach((binding) => {
				const keys = binding.keys.join(", ");
				const padding = 25 - keys.length;
				lines.push(
					`  {cyan-fg}${keys}{/}${" ".repeat(Math.max(0, padding))}${binding.description}`,
				);
			});

			lines.push("");
		});

		// Footer
		lines.push("");
		lines.push("{gray-fg}" + "─".repeat(40) + "{/}");
		lines.push(
			"{gray-fg}Tip: Use vim-style navigation (hjkl) throughout the interface{/}",
		);

		this.content.setContent(lines.join("\n"));
	}

	show() {
		this.box.show();
		this.content.focus();
		this.box.screen.render();
	}

	hide() {
		this.box.hide();
		this.box.screen.render();
	}

	focus() {
		this.content.focus();
	}

	destroy() {
		this.unsubscribe();
		this.box.destroy();
	}
}
