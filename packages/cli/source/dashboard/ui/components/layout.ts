import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";
import type { KeymapService } from "../../services/keymap.js";
import { ProjectSidebar } from "./project-sidebar.js";
import { TaskTreeComponent } from "./task-tree.js";
import { DetailPane } from "./detail-pane.js";
import { StatusBar } from "./status-bar.js";
import { CommandPalette } from "./command-palette.js";
import { HelpOverlay } from "./help-overlay.js";
import { Legend } from "./legend.js";

export class DashboardLayout {
	private projectSidebar: ProjectSidebar;
	private taskTree: TaskTreeComponent;
	private detailPane: DetailPane;
	private statusBar: StatusBar;
	private legend: Legend;
	private commandPalette: CommandPalette;
	private helpOverlay: HelpOverlay;
	private unsubscribe: () => void;

	constructor(
		private screen: blessed.Widgets.Screen,
		private store: StoreApi<DashboardStore>,
		_keymapService: KeymapService
	) {
		// Create layout containers
		const mainContainer = blessed.box({
			parent: screen,
			top: 0,
			left: 0,
			right: 0,
			bottom: 4, // Leave room for status bar and legend
		});

		// Initialize components
		this.projectSidebar = new ProjectSidebar(mainContainer, store);
		this.taskTree = new TaskTreeComponent(mainContainer, store);
		this.detailPane = new DetailPane(mainContainer, store);
		this.statusBar = new StatusBar(screen, store);
		this.legend = new Legend(screen, store);
		this.commandPalette = new CommandPalette(screen, store);
		this.helpOverlay = new HelpOverlay(screen, store);

		// Set up layout
		this.setupLayout();
		this.setupKeyBindings();

		// Subscribe to store changes
		this.unsubscribe = () => { };
	}

	private setupLayout() {
		// Get screen dimensions
		const screenWidth = this.screen.width as number;
		const screenHeight = (this.screen.height as number) - 4; // Leave room for status bar and legend

		// Calculate panel widths
		const sidebarWidth = Math.floor(screenWidth * 0.2);
		const treeWidth = Math.floor(screenWidth * 0.5);
		const detailWidth = screenWidth - sidebarWidth - treeWidth;

		// Project sidebar (left)
		this.projectSidebar.setPosition({
			top: 0,
			left: 0,
			width: sidebarWidth,
			height: screenHeight
		} as any);

		// Task tree (center)
		this.taskTree.setPosition({
			top: 0,
			left: sidebarWidth,
			width: treeWidth,
			height: screenHeight
		} as any);

		// Detail pane (right)
		this.detailPane.setPosition({
			top: 0,
			left: sidebarWidth + treeWidth,
			width: detailWidth,
			height: screenHeight
		} as any);

		// Legend (above status bar)
		this.legend.setPosition({
			bottom: 1,
			left: 0,
			right: 0,
			height: 3
		} as any);

		// Status bar (bottom)
		this.statusBar.setPosition({
			bottom: 0,
			left: 0,
			right: 0,
			height: 1
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

		// Focus management
		this.unsubscribe = this.store.subscribe((state) => {
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
				this.commandPalette.focus();
			} else {
				this.commandPalette.hide();
			}

			if (state.helpOverlayOpen) {
				this.helpOverlay.show();
				this.helpOverlay.focus();
			} else {
				this.helpOverlay.hide();
			}

			this.screen.render();
		});
	}

	private cycleActivePanel(reverse = false) {
		const state = this.store.getState();
		const panels: Array<DashboardStore["activePanel"]> = ["sidebar", "tree", "details"];
		const currentIndex = panels.indexOf(state.activePanel);
		const direction = reverse ? -1 : 1;
		const nextIndex = (currentIndex + direction + panels.length) % panels.length;
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
		// Re-calculate positions
		this.setupLayout();
		this.screen.render();
	}

	destroy() {
		this.unsubscribe();
	}
}
