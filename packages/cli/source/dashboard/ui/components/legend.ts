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
		const { activePanel } = state;

		let content = "";

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
				"Space: Toggle",
				"a/A: Add Task",
				"D: Delete",
			],
			details: ["↑/k: Scroll Up", "↓/j: Scroll Down"],
		};

		// Build content
		const activePanelBindings = panelBindings[activePanel] || [];
		const allBindings = [...activePanelBindings, ...commonBindings];

		// Split into two rows for better layout
		const half = Math.ceil(allBindings.length / 2);
		const row1 = allBindings.slice(0, half).join(" │ ");
		const row2 = allBindings.slice(half).join(" │ ");

		content = `${row1}\n${row2}`;

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
