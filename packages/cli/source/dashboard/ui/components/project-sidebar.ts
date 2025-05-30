import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

export class ProjectSidebar {
	private list: blessed.Widgets.ListElement;
	private unsubscribe: () => void;

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		// Create the list widget
		this.list = blessed.list({
			parent: this.parent,
			label: " Projects ",
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "cyan",
				},
				selected: {
					bg: "blue",
					fg: "black",
					bold: true,
				},
				focus: {
					border: {
						fg: "yellow",
					},
				},
			},
			keys: true,
			mouse: true,
			scrollable: true,
			alwaysScroll: true,
		});

		this.setupEventHandlers();

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			this.render(state);
		});

		// Initial render
		this.render(this.store.getState());
	}

	private setupEventHandlers() {
		const state = () => this.store.getState();

		// Selection change
		this.list.on("select item", (_el, selected) => {
			const projects = state().projects;
			if (projects[selected]) {
				state().selectProject(projects[selected].id);
			}
		});

		// Key handlers
		this.list.key(["enter"], () => {
			const selected = (this.list as any).selected;
			const projects = state().projects;
			if (projects[selected]) {
				state().selectProject(projects[selected].id);
				// Focus on task tree
				state().setActivePanel("tree");
			}
		});

		// Mouse click handling - when clicking a project, select it and switch to tree view
		this.list.on("click", () => {
			const selected = (this.list as any).selected;
			const projects = state().projects;
			if (projects[selected]) {
				state().selectProject(projects[selected].id);
				// Focus on task tree to show the selected project
				state().setActivePanel("tree");
			}
		});
	}

	private render(state: DashboardStore) {
		const { projects, selectedProjectId } = state;

		// Build list items
		const items = projects.map((project) => {
			const progressBar = this.createProgressBar(project.progress);
			const isSelected = project.id === selectedProjectId;
			const marker = isSelected ? "▸ " : "  ";

			return `${marker}${project.name} ${progressBar} ${Math.round(project.progress)}%`;
		});

		// Add empty state message if no projects
		if (items.length === 0) {
			items.push("  No projects yet");
			items.push("");
			items.push("  Create a task to");
			items.push("  start a project");
		}

		this.list.setItems(items);

		// Restore selection
		if (selectedProjectId) {
			const index = projects.findIndex((p) => p.id === selectedProjectId);
			if (index >= 0) {
				this.list.select(index);
			}
		}

		this.list.screen.render();
	}

	private createProgressBar(progress: number): string {
		const width = 10;
		const filled = Math.round((progress / 100) * width);
		const empty = width - filled;

		const filledChars = "█".repeat(filled);
		const emptyChars = "░".repeat(empty);

		// Return plain text progress bar
		return filledChars + emptyChars;
	}

	setPosition(position: blessed.Widgets.Position) {
		Object.assign(this.list, position);
	}

	focus() {
		this.list.focus();
	}

	destroy() {
		this.unsubscribe();
		this.list.destroy();
	}
}
