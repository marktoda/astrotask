import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { KeymapService } from "../../services/keymap.js";
import type { EnhancedKeymapService } from "../../services/enhanced-keymap.js";
import type { DashboardStore } from "../../store/index.js";
import { CommandPalette } from "./command-palette.js";
import { DetailPane } from "./detail-pane.js";
import { HelpOverlay } from "./help-overlay.js";
import { Legend } from "./legend.js";
import { ProjectSidebar } from "./project-sidebar.js";
import { StatusBar } from "./status-bar.js";
import { TaskTreeComponent } from "./task-tree.js";
import { FooterHintRenderer } from "./footer-hint-renderer.js";
import { ContextTracker } from "../../services/context-tracker.js";
import { HintScorer } from "../../services/hint-scorer.js";

export class DashboardLayout {
	private projectSidebar: ProjectSidebar;
	private taskTree: TaskTreeComponent;
	private detailPane: DetailPane;
	private statusBar: StatusBar;
	private legend: Legend;
	private commandPalette: CommandPalette;
	private helpOverlay: HelpOverlay;
	private footerHintRenderer: FooterHintRenderer;
	private contextTracker: ContextTracker;
	private hintScorer: HintScorer;
	private unsubscribe: () => void;

	constructor(
		private screen: blessed.Widgets.Screen,
		private store: StoreApi<DashboardStore>,
		keymapService: KeymapService | EnhancedKeymapService,
	) {
		// Initialize footer hint system
		this.contextTracker = new ContextTracker(store);
		
		// Check if we have the enhanced keymap service with registry access
		if ('getRegistry' in keymapService) {
			const registry = (keymapService as EnhancedKeymapService).getRegistry();
			this.hintScorer = new HintScorer(registry, this.contextTracker);
		} else {
			// TODO: Create a basic scorer that works with legacy KeymapService
			// For now, we'll skip hint scoring if registry is not available
			throw new Error("Footer hints require EnhancedKeymapService with registry access");
		}
		
		this.footerHintRenderer = new FooterHintRenderer(
			this.hintScorer,
			this.contextTracker,
			store
		);

		// Create layout containers
		const mainContainer = blessed.box({
			parent: screen,
			top: 0,
			left: 0,
			right: 0,
			bottom: 5, // Increased from 4 to 5 to account for larger legend
		});

		// Initialize components
		this.projectSidebar = new ProjectSidebar(mainContainer, store);
		this.taskTree = new TaskTreeComponent(mainContainer, store);
		this.detailPane = new DetailPane(mainContainer, store);
		this.statusBar = new StatusBar(screen, store);
		this.legend = new Legend(screen, store, this.footerHintRenderer); // Pass footer hint renderer
		this.commandPalette = new CommandPalette(screen, store);
		this.helpOverlay = new HelpOverlay(screen, store);

		// Set up the callback now that legend exists
		(this.footerHintRenderer as any).onStateChange = () => {
			this.legend.render(store.getState());
		};

		// Set up layout
		this.setupLayout();
		this.setupKeyBindings();

		// Subscribe to store changes
		this.unsubscribe = () => {};
	}

	private setupLayout() {
		// Get screen dimensions
		const screenWidth = this.screen.width as number;
		const screenHeight = (this.screen.height as number) - 5; // Updated to match bottom: 5

		// Calculate panel widths
		const sidebarWidth = Math.floor(screenWidth * 0.2);
		const treeWidth = Math.floor(screenWidth * 0.5);
		const detailWidth = screenWidth - sidebarWidth - treeWidth;

		// Project sidebar (left)
		this.projectSidebar.setPosition({
			top: 0,
			left: 0,
			width: sidebarWidth,
			height: screenHeight,
		} as any);

		// Task tree (center)
		this.taskTree.setPosition({
			top: 0,
			left: sidebarWidth,
			width: treeWidth,
			height: screenHeight,
		} as any);

		// Detail pane (right)
		this.detailPane.setPosition({
			top: 0,
			left: sidebarWidth + treeWidth,
			width: detailWidth,
			height: screenHeight,
		} as any);

		// Legend (above status bar) - updated height
		this.legend.setPosition({
			bottom: 1,
			left: 0,
			right: 0,
			height: 4, // Updated from 3 to 4
		} as any);

		// Status bar (bottom)
		this.statusBar.setPosition({
			bottom: 0,
			left: 0,
			right: 0,
			height: 1,
		} as any);
	}

	private setupKeyBindings() {
		const state = () => this.store.getState();

		// Tab and Shift-Tab – include every alias for robust handling
		this.screen.key(["tab", "C-i"], () => {
			this.cycleActivePanel();
		});

		this.screen.key(["S-tab", "btab"], () => {
			this.cycleActivePanel(true);
		});

		// Command palette - use multiple key aliases
		this.screen.key([":"], () => {
			state().toggleCommandPalette();
		});

		// Help overlay - use multiple key aliases
		this.screen.key(["?"], () => {
			state().toggleHelpOverlay();
		});

		// Toggle completed tasks visibility
		this.screen.key(["c"], () => {
			state().toggleShowCompletedTasks();
			const newState = state();
			const statusText = newState.showCompletedTasks
				? "Showing all tasks (including completed)"
				: "Hiding completed tasks";
			state().setStatusMessage(statusText);
		});

		// Debug: Force show footer hints (F1 key)
		this.screen.key(["f1"], () => {
			this.footerHintRenderer.forceShow();
		});

		// Focus management
		this.unsubscribe = this.store.subscribe((state) => {
			// Skip all updates if editor is active
			if (state.editorActive) {
				return;
			}

			switch (state.activePanel) {
				case "sidebar":
					this.projectSidebar.focus();
					break;
				case "tree":
					this.taskTree.focus();
					break;
				case "details":
					this.detailPane.focus();
					break;
			}

			// Handle overlays
			if (state.commandPaletteOpen) {
				this.commandPalette.show();
			} else {
				this.commandPalette.hide();
			}

			if (state.helpOverlayOpen) {
				this.helpOverlay.show();
			} else {
				this.helpOverlay.hide();
			}

			this.screen.render();
		});
	}

	private cycleActivePanel(reverse = false) {
		const state = this.store.getState();
		const panels: Array<DashboardStore["activePanel"]> = [
			"sidebar",
			"tree",
			"details",
		];
		const currentIndex = panels.indexOf(state.activePanel);
		const direction = reverse ? -1 : 1;
		const nextIndex =
			(currentIndex + direction + panels.length) % panels.length;
		const nextPanel = panels[nextIndex];
		if (nextPanel) {
			state.setActivePanel(nextPanel);
		}
	}

	async initialize() {
		const state = this.store.getState();

		// Load initial data
		await state.loadTasks();

		// Focus on task tree by default
		state.setActivePanel("tree");

		// Wait for next tick to ensure rendering is complete
		process.nextTick(() => {
			this.taskTree.focus();
		});

		// Render initial state
		this.screen.render();
	}

	handleResize() {
		// Skip resize if editor is active
		const state = this.store.getState();
		if (state.editorActive) {
			return;
		}

		// Re-calculate positions
		this.setupLayout();
		this.screen.render();
	}

	destroy() {
		this.unsubscribe();
		this.footerHintRenderer.destroy();
		this.contextTracker.destroy();
	}
}
