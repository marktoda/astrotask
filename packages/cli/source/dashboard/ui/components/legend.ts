import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";
import { StatusRenderer } from "../../utils/status-renderer.js";
import type { FooterHintRenderer } from "./footer-hint-renderer.js";

export class Legend {
	private box: blessed.Widgets.BoxElement;
	private unsubscribe: () => void;
	private footerHintRenderer?: FooterHintRenderer;
	private statusRenderer: StatusRenderer;
	private autoHideTimer?: NodeJS.Timeout;
	private isHidden: boolean = false;
	private readonly AUTO_HIDE_DELAY = 5000; // 5 seconds

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
		footerHintRenderer?: FooterHintRenderer,
	) {
		this.footerHintRenderer = footerHintRenderer;

		// Initialize enhanced rendering systems
		this.statusRenderer = StatusRenderer.create();

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
			this.onActivity(); // Any state change indicates activity
			this.render(state);
		});

		// Set up auto-hide functionality
		this.setupAutoHide();

		// Initial render
		this.render(this.store.getState());
	}

	public render(state: DashboardStore) {
		// Don't render if hidden
		if (this.isHidden) {
			return;
		}

		const { activePanel, treeViewMode, selectedTaskId } = state;

		let content = "";

		// Enhanced status legend using StatusRenderer
		const statusLegend = this.buildStatusLegend();

		// Dependency relationship legend (when a task is selected)
		const dependencyLegend = selectedTaskId ? this.buildDependencyLegend() : "";

		// Updated keybindings reflecting new shortcuts
		const updatedPanelBindings: Record<
			DashboardStore["activePanel"],
			string[]
		> = {
			sidebar: ["↑/k: Up", "↓/j: Down", "Enter: Select"],
			tree: [
				"↑/k: Up",
				"↓/j: Down",
				"←/h: Collapse",
				"→/l: Expand",
				"Enter/Space: Toggle Pending⇄Active",
				"Shift+D: Mark Done",
				"b/B: Block/Unblock",
				"a/A: Add Task",
				"e: Edit Task",
				"Del: Delete",
				"d: Toggle View",
			],
			details: ["↑/k: Scroll Up", "↓/j: Scroll Down", "g: Graph View"],
		};

		// Common bindings (unchanged)
		const commonBindings = [
			"Tab: Next Panel",
			"?: Help",
			":: Commands",
			"q: Quit",
		];

		// Build content with enhanced information
		const activePanelBindings = updatedPanelBindings[activePanel] || [];

		// First row: Enhanced status legend with view mode indicator
		let row1 = `Status: ${statusLegend}`;
		if (activePanel === "tree") {
			const viewMode = treeViewMode === "dependencies" ? "Deps" : "Tree";
			row1 += ` │ View: ${viewMode}`;
		}

		// Second row: Dependency legend (if applicable) or footer hints
		let row2 = "";

		if (dependencyLegend) {
			row2 = `Dependencies: ${dependencyLegend}`;
		} else {
			// Check for footer hints
			const footerHints = this.footerHintRenderer?.getHintContent();

			if (footerHints && footerHints.length > 0) {
				// Show dynamic footer hints
				row2 = footerHints;
			} else {
				// Fallback to static keybindings
				const keyBindings = [...activePanelBindings, ...commonBindings];
				row2 = keyBindings.join(" │ ");
			}
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
		// Clear auto-hide timer
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer);
		}

		this.unsubscribe();
		this.box.destroy();
	}

	private setupAutoHide() {
		// Monitor screen events for activity
		if (this.box.screen) {
			this.box.screen.on("keypress", () => this.onActivity());
			this.box.screen.on("mouse", () => this.onActivity());
		}

		// Start the initial timer
		this.resetAutoHideTimer();
	}

	private onActivity() {
		// Show legend if it was hidden
		if (this.isHidden) {
			this.show();
		}

		// Reset the auto-hide timer
		this.resetAutoHideTimer();
	}

	/**
	 * Reset the auto-hide timer
	 */
	private resetAutoHideTimer() {
		if (this.autoHideTimer) {
			clearTimeout(this.autoHideTimer);
		}

		this.autoHideTimer = setTimeout(() => {
			this.hide();
		}, this.AUTO_HIDE_DELAY);
	}

	/**
	 * Hide the legend
	 */
	private hide() {
		if (!this.isHidden) {
			this.isHidden = true;
			this.box.hide();
			this.box.screen.render();
		}
	}

	/**
	 * Show the legend
	 */
	private show() {
		if (this.isHidden) {
			this.isHidden = false;
			this.box.show();
			this.render(this.store.getState());
		}
	}

	/**
	 * Build enhanced status legend using StatusRenderer
	 */
	private buildStatusLegend(): string {
		const statuses = ["pending", "in-progress", "blocked", "done"] as const;
		const items = statuses.map((status) => {
			const glyph = this.statusRenderer.renderStatus(status);
			const description =
				status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ");
			return `${glyph} ${description}`;
		});

		return items.join(" │ ");
	}

	/**
	 * Build dependency relationship legend with background colors
	 */
	private buildDependencyLegend(): string {
		const relationships = [
			{ type: "⚠ Blocking (pending)", bg: "red" },
			{ type: "✓ Blocking (done)", bg: "green" },
			{ type: "← Dependent", bg: "blue" },
			{ type: "~ Related", bg: "yellow" },
		];

		const items = relationships.map((rel) => {
			// Use background color styling for the sample
			return `{${rel.bg}-bg} ${rel.type} {/${rel.bg}-bg}`;
		});

		return items.join(" │ ");
	}
}
