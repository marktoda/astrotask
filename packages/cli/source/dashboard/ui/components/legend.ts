import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";
import type { FooterHintRenderer } from "./footer-hint-renderer.js";

export class Legend {
	private box: blessed.Widgets.BoxElement;
	private unsubscribe: () => void;
	private footerHintRenderer?: FooterHintRenderer;

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
		footerHintRenderer?: FooterHintRenderer,
	) {
		this.footerHintRenderer = footerHintRenderer;

		// Create the legend box
		this.box = blessed.box({
			parent: this.parent,
			bottom: 1,
			left: 0,
			right: 0,
			height: 4,
			tags: true,
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

	public render(state: DashboardStore) {
		const { activePanel, treeViewMode } = state;

		let content = "";

		// Icon legend - keep only the most essential ones
		const iconLegend = [
			"○ Pending",
			"◉ In Progress", 
			"✓ Done",
			"! High Priority",
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

		// First row: icon legend with view mode indicator
		let row1 = `Icons: ${iconLegend.join(" │ ")}`;
		if (activePanel === "tree") {
			const viewMode = treeViewMode === "dependencies" ? "Deps" : "Tree";
			row1 += ` │ View: ${viewMode}`;
		}

		// Second row: key bindings (or footer hints if available)
		let row2 = "";
		
		// Check for footer hints first
		const footerHints = this.footerHintRenderer?.getHintContent();
		
		if (footerHints && footerHints.length > 0) {
			// Show dynamic footer hints
			row2 = footerHints;
		} else {
			// Fallback to static keybindings
			const keyBindings = [...activePanelBindings, ...commonBindings];
			row2 = keyBindings.join(" │ ");
		}

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
