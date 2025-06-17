import blessed from "blessed";
import type { StoreApi } from "zustand";
import type {
	FirstRunDetector,
	TooltipTriggerEvent,
} from "../../services/first-run-detector.js";
import type { DashboardStore } from "../../store/index.js";
import type {
	EnhancedKeyBinding,
	PaneContext,
} from "../../types/keybinding.js";

export interface GhostTextConfig {
	/** Default display duration in milliseconds */
	displayDuration: number;
	/** Fade in/out animation duration in milliseconds */
	animationDuration: number;
	/** Whether to auto-hide on any key press */
	autoHideOnKeyPress: boolean;
	/** Whether to auto-hide on focus change */
	autoHideOnFocusChange: boolean;
	/** Maximum number of concurrent tooltips */
	maxConcurrentTooltips: number;
	/** Delay between sequential tooltips in milliseconds */
	sequentialDelay: number;
}

export interface ActiveTooltip {
	/** Unique identifier */
	id: string;
	/** The blessed box element */
	element: blessed.Widgets.BoxElement;
	/** Associated keybinding */
	binding: EnhancedKeyBinding;
	/** Context where tooltip appears */
	context: PaneContext;
	/** Timestamp when tooltip was created */
	createdAt: number;
	/** Auto-hide timer */
	timer: NodeJS.Timeout | null;
	/** Whether tooltip is currently visible */
	visible: boolean;
}

/**
 * GhostTextRenderer displays subtle tooltips beside focused rows
 * to help users discover keybindings contextually
 */
export class GhostTextRenderer {
	private store: StoreApi<DashboardStore>;
	private firstRunDetector: FirstRunDetector;
	private config: GhostTextConfig;

	private activeTooltips: Map<string, ActiveTooltip> = new Map();
	private screen: blessed.Widgets.Screen;
	private sequentialQueue: TooltipTriggerEvent[] = [];
	private isProcessingQueue = false;
	private sequentialTimer: NodeJS.Timeout | null = null;

	// Default configuration
	private static readonly DEFAULT_CONFIG: GhostTextConfig = {
		displayDuration: 4000, // 4 seconds
		animationDuration: 300, // 300ms fade
		autoHideOnKeyPress: true,
		autoHideOnFocusChange: true,
		maxConcurrentTooltips: 2, // Max 2 tooltips at once
		sequentialDelay: 1500, // 1.5 seconds between tooltips
	};

	constructor(
		screen: blessed.Widgets.Screen,
		store: StoreApi<DashboardStore>,
		firstRunDetector: FirstRunDetector,
		config?: Partial<GhostTextConfig>,
	) {
		this.screen = screen;
		this.store = store;
		this.firstRunDetector = firstRunDetector;
		this.config = { ...GhostTextRenderer.DEFAULT_CONFIG, ...config };

		this.initialize();
	}

	/**
	 * Initialize the ghost text renderer
	 */
	private initialize(): void {
		// Listen for tooltip trigger events from first-run detector
		this.firstRunDetector.addEventListener(
			this.handleTooltipTrigger.bind(this),
		);

		// Set up global key handler for auto-hide
		if (this.config.autoHideOnKeyPress) {
			this.screen.on("keypress", this.handleKeyPress.bind(this));
		}

		// Set up focus change handler for auto-hide
		if (this.config.autoHideOnFocusChange) {
			this.setupFocusChangeHandler();
		}
	}

	/**
	 * Handle tooltip trigger events from first-run detector
	 */
	private handleTooltipTrigger(event: TooltipTriggerEvent): void {
		if (process.env["DEBUG_ONBOARDING"]) {
			console.error(
				`DEBUG: Ghost text trigger for ${event.binding.key} in ${event.context}`,
			);
		}

		// Add to sequential queue for processing
		this.sequentialQueue.push(event);
		this.processSequentialQueue();
	}

	/**
	 * Process the sequential tooltip queue
	 */
	private async processSequentialQueue(): Promise<void> {
		if (this.isProcessingQueue || this.sequentialQueue.length === 0) {
			return;
		}

		this.isProcessingQueue = true;

		while (this.sequentialQueue.length > 0) {
			// Check if we're at max concurrent tooltips
			if (this.activeTooltips.size >= this.config.maxConcurrentTooltips) {
				// Wait for a tooltip to expire
				await this.waitForTooltipSlot();
			}

			const event = this.sequentialQueue.shift();
			if (event) {
				await this.showTooltip(event);

				// Delay before next tooltip if there are more in queue
				if (this.sequentialQueue.length > 0) {
					await this.delay(this.config.sequentialDelay);
				}
			}
		}

		this.isProcessingQueue = false;
	}

	/**
	 * Show a tooltip for a keybinding
	 */
	private async showTooltip(event: TooltipTriggerEvent): Promise<void> {
		const tooltipId = this.generateTooltipId(event.binding, event.context);

		// Don't show duplicate tooltips
		if (this.activeTooltips.has(tooltipId)) {
			return;
		}

		// Get position for the tooltip
		const position = this.calculateTooltipPosition(event.context);
		if (!position) {
			if (process.env["DEBUG_ONBOARDING"]) {
				console.error(
					`DEBUG: Could not calculate position for tooltip in ${event.context}`,
				);
			}
			return;
		}

		// Create tooltip element
		const tooltip = this.createTooltipElement(event.binding, position);

		// Create active tooltip entry
		const activeTooltip: ActiveTooltip = {
			id: tooltipId,
			element: tooltip,
			binding: event.binding,
			context: event.context,
			createdAt: Date.now(),
			timer: null,
			visible: true,
		};

		// Set up auto-hide timer
		activeTooltip.timer = setTimeout(() => {
			this.hideTooltip(tooltipId);
		}, this.config.displayDuration);

		// Add to active tooltips
		this.activeTooltips.set(tooltipId, activeTooltip);

		// Render the screen to show the tooltip
		this.screen.render();

		if (process.env["DEBUG_ONBOARDING"]) {
			console.error(
				`DEBUG: Showing ghost text for ${event.binding.key} at position ${JSON.stringify(position)}`,
			);
		}
	}

	/**
	 * Calculate position for tooltip based on context
	 */
	private calculateTooltipPosition(
		context: PaneContext,
	): { top: number; left: number; width: number } | null {
		const state = this.store.getState();

		// Get the active panel's focused element position
		let focusedElement: blessed.Widgets.BlessedElement | null = null;
		let panelBounds: {
			top: number;
			left: number;
			width: number;
			height: number;
		} | null = null;

		// Find the focused element and panel bounds based on context
		switch (context) {
			case "task_tree":
				if (state.activePanel === "tree") {
					focusedElement = this.findFocusedListElement("tree");
					panelBounds = this.getPanelBounds("tree");
				}
				break;
			case "project_list":
				if (state.activePanel === "sidebar") {
					focusedElement = this.findFocusedListElement("sidebar");
					panelBounds = this.getPanelBounds("sidebar");
				}
				break;
			case "task_detail":
				if (state.activePanel === "details") {
					focusedElement = this.findFocusedListElement("details");
					panelBounds = this.getPanelBounds("details");
				}
				break;
		}

		if (!focusedElement || !panelBounds) {
			return null;
		}

		// Calculate tooltip position beside the focused element
		const focusedTop = this.getElementTop(focusedElement);
		const focusedLeft = this.getElementLeft(focusedElement);

		// Position tooltip to the right of the focused element with some padding
		const tooltipLeft = Math.min(
			focusedLeft + Math.floor(panelBounds.width * 0.7), // 70% across the panel
			panelBounds.left + panelBounds.width - 25, // Leave room for tooltip
		);

		return {
			top: focusedTop,
			left: tooltipLeft,
			width: Math.min(25, panelBounds.left + panelBounds.width - tooltipLeft),
		};
	}

	/**
	 * Create tooltip blessed element
	 */
	private createTooltipElement(
		binding: EnhancedKeyBinding,
		position: { top: number; left: number; width: number },
	): blessed.Widgets.BoxElement {
		// Format the keybinding text
		const keyText = this.formatKeyText(binding.key);
		const descText =
			binding.description || binding.action?.toString().slice(0, 20) || "";

		// Create tooltip content
		const content = `{dim-cyan-fg}${keyText}{/} {dim-white-fg}${descText}{/}`;

		const tooltip = blessed.box({
			parent: this.screen,
			top: position.top,
			left: position.left,
			width: position.width,
			height: 1,
			content: content,
			tags: true,
			style: {
				fg: "gray",
				bg: "transparent",
			},
			transparent: true,
			shrink: true,
			padding: {
				left: 1,
				right: 1,
			},
		});

		return tooltip;
	}

	/**
	 * Format key text for display
	 */
	private formatKeyText(key: string): string {
		// Convert key format to display format
		const keyMap: Record<string, string> = {
			"c-": "Ctrl+",
			"s-": "Shift+",
			"m-": "Alt+",
			return: "Enter",
			space: "Space",
			escape: "Esc",
			backspace: "Backspace",
			delete: "Del",
			up: "↑",
			down: "↓",
			left: "←",
			right: "→",
		};

		let formatted = key;
		for (const [pattern, replacement] of Object.entries(keyMap)) {
			formatted = formatted.replace(pattern, replacement);
		}

		return formatted;
	}

	/**
	 * Hide a tooltip
	 */
	private hideTooltip(tooltipId: string): void {
		const tooltip = this.activeTooltips.get(tooltipId);
		if (!tooltip) {
			return;
		}

		// Clear timer
		if (tooltip.timer) {
			clearTimeout(tooltip.timer);
		}

		// Remove element from screen
		if (tooltip.element.parent) {
			tooltip.element.parent.remove(tooltip.element);
		}

		// Remove from active tooltips
		this.activeTooltips.delete(tooltipId);

		// Re-render screen
		this.screen.render();

		// Remove debug log
		// console.error(`DEBUG: Hidden ghost text for ${tooltip.binding.key}`);
	}

	/**
	 * Hide all active tooltips
	 */
	hideAllTooltips(): void {
		const tooltipIds = Array.from(this.activeTooltips.keys());
		for (const id of tooltipIds) {
			this.hideTooltip(id);
		}
	}

	/**
	 * Handle key press for auto-hide
	 */
	private handleKeyPress(): void {
		if (this.config.autoHideOnKeyPress && this.activeTooltips.size > 0) {
			this.hideAllTooltips();
		}
	}

	/**
	 * Set up focus change handler
	 */
	private setupFocusChangeHandler(): void {
		// Listen for store changes that indicate focus changes
		this.store.subscribe((state, prevState) => {
			if (
				state.activePanel !== prevState.activePanel &&
				this.config.autoHideOnFocusChange
			) {
				this.hideAllTooltips();
			}
		});
	}

	/**
	 * Find focused list element in a panel
	 */
	private findFocusedListElement(
		_panel: "tree" | "sidebar" | "details",
	): blessed.Widgets.BlessedElement | null {
		// This is a simplified approach - in a real implementation, we'd need
		// access to the actual component instances to get their focused elements
		// For now, we'll return a placeholder that represents the general panel area
		return this.screen.focused || this.screen;
	}

	/**
	 * Get panel bounds for positioning calculations
	 */
	private getPanelBounds(
		panel: "tree" | "sidebar" | "details",
	): { top: number; left: number; width: number; height: number } | null {
		const screenWidth = this.screen.width as number;
		const screenHeight = (this.screen.height as number) - 5;

		// Calculate based on the layout from DashboardLayout
		const sidebarWidth = Math.floor(screenWidth * 0.2);
		const treeWidth = Math.floor(screenWidth * 0.5);
		const detailWidth = screenWidth - sidebarWidth - treeWidth;

		switch (panel) {
			case "sidebar":
				return {
					top: 1, // Account for border
					left: 1,
					width: sidebarWidth - 2,
					height: screenHeight - 2,
				};
			case "tree":
				return {
					top: 1,
					left: sidebarWidth + 1,
					width: treeWidth - 2,
					height: screenHeight - 2,
				};
			case "details":
				return {
					top: 1,
					left: sidebarWidth + treeWidth + 1,
					width: detailWidth - 2,
					height: screenHeight - 2,
				};
			default:
				return null;
		}
	}

	/**
	 * Get element top position
	 */
	private getElementTop(_element: blessed.Widgets.BlessedElement): number {
		// In a real implementation, this would calculate the actual row position
		// For now, we'll use a reasonable default
		return Math.floor((this.screen.height as number) / 2);
	}

	/**
	 * Get element left position
	 */
	private getElementLeft(_element: blessed.Widgets.BlessedElement): number {
		// In a real implementation, this would calculate the actual column position
		// For now, we'll use a reasonable default
		return Math.floor((this.screen.width as number) / 4);
	}

	/**
	 * Generate unique tooltip ID
	 */
	private generateTooltipId(
		binding: EnhancedKeyBinding,
		context: PaneContext,
	): string {
		return `${context}-${binding.key}-${Date.now()}`;
	}

	/**
	 * Wait for a tooltip slot to become available
	 */
	private async waitForTooltipSlot(): Promise<void> {
		return new Promise((resolve) => {
			const checkSlot = () => {
				if (this.activeTooltips.size < this.config.maxConcurrentTooltips) {
					resolve();
				} else {
					setTimeout(checkSlot, 100);
				}
			};
			checkSlot();
		});
	}

	/**
	 * Utility delay function
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Get current tooltip statistics
	 */
	getStats(): {
		activeTooltips: number;
		queueLength: number;
		isProcessing: boolean;
	} {
		return {
			activeTooltips: this.activeTooltips.size,
			queueLength: this.sequentialQueue.length,
			isProcessing: this.isProcessingQueue,
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<GhostTextConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current configuration
	 */
	getConfig(): GhostTextConfig {
		return { ...this.config };
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		// Clear all timers
		if (this.sequentialTimer) {
			clearTimeout(this.sequentialTimer);
		}

		// Hide all tooltips
		this.hideAllTooltips();

		// Clear queue
		this.sequentialQueue = [];
		this.isProcessingQueue = false;
	}
}
