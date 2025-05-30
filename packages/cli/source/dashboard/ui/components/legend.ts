import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

export class Legend {
	private box: blessed.Widgets.BoxElement;
	private unsubscribe: () => void;

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		// Create the legend box
		this.box = blessed.box({
			parent: this.parent,
			bottom: 1,
			left: 0,
			right: 0,
			height: 3,
			style: {
				bg: "black",
				fg: "white",
			},
			border: {
				type: "line",
			},
			padding: {
				left: 1,
				right: 1,
			},
		});

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			this.render(state);
		});

		// Initial render
		this.render(this.store.getState());
	}

	private render(state: DashboardStore) {
		const { activePanel, treeViewMode } = state;

		let content = "";

		// Icon legend - always show
		const iconLegend = [
			"○ Pending",
			"◉ In Progress",
			"✓ Done",
			"! High Priority",
			"Red Text = Blocked",
		];

		// Common bindings
		const commonBindings = [
			"Tab: Next Panel",
			"?: Help",
			":: Commands",
			"q: Quit",
		];

		// Panel-specific bindings
		const panelBindings: Record<DashboardStore["activePanel"], string[]> = {
			sidebar: ["↑/k: Up", "↓/j: Down", "Enter: Select"],
			tree: [
				"↑/k: Up",
				"↓/j: Down",
				"←/h: Collapse",
				"→/l: Expand",
				"Space: Cycle Status",
				"a/A: Add Task",
				"e: Edit Task",
				"D: Delete",
				"d: Toggle View",
			],
			details: ["↑/k: Scroll Up", "↓/j: Scroll Down", "g: Graph View"],
		};

		// Build content
		const activePanelBindings = panelBindings[activePanel] || [];

		// First row: icon legend
		const row1 = `Icons: ${iconLegend.join(" │ ")}`;

		// Second row: key bindings
		const keyBindings = [...activePanelBindings, ...commonBindings];
		const row2 = keyBindings.join(" │ ");

		// Add view mode indicator for tree panel
		let viewModeIndicator = "";
		if (activePanel === "tree") {
			viewModeIndicator =
				treeViewMode === "dependencies"
					? " {yellow-fg}[Dependency View]{/}"
					: " {green-fg}[Hierarchy View]{/}";
		}

		content = `${row1}${viewModeIndicator}\n${row2}`;

		this.box.setContent(content);
		this.box.screen.render();
	}

	setPosition(position: blessed.Widgets.Position) {
		Object.assign(this.box, position);
	}

	focus() {
		// Legend doesn't take focus
	}

	destroy() {
		this.unsubscribe();
		this.box.destroy();
	}
}
