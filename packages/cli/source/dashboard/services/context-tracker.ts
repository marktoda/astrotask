import type { StoreApi } from "zustand";
import type { DashboardStore } from "../store/index.js";
import type { PaneContext } from "../types/keybinding.js";

export interface ContextEvent {
	type: "navigation" | "idle" | "action";
	context: PaneContext;
	timestamp: number;
	previousContext?: PaneContext;
}

export interface ContextState {
	currentContext: PaneContext;
	previousContext: PaneContext | null;
	lastNavigationTime: number;
	lastActionTime: number;
	idleStartTime: number | null;
	isIdle: boolean;
	navigationHistory: ContextEvent[];
}

/**
 * ContextTracker monitors pane navigation and user activity to provide
 * contextual information for the footer hint system
 */
export class ContextTracker {
	private store: StoreApi<DashboardStore>;
	private state: ContextState;
	private unsubscribe: (() => void) | null = null;
	private idleTimer: NodeJS.Timeout | null = null;
	private listeners: Array<(event: ContextEvent) => void> = [];

	// Configuration
	private readonly IDLE_THRESHOLD_MS = 2000; // 2 seconds of inactivity triggers idle state
	private readonly MAX_HISTORY_LENGTH = 50; // Keep last 50 navigation events

	// Context mapping from dashboard panels to keybinding contexts
	private readonly contextMapping: Map<
		DashboardStore["activePanel"],
		PaneContext
	> = new Map([
		["sidebar", "project_list"],
		["tree", "task_tree"],
		["details", "task_detail"],
	]);

	constructor(store: StoreApi<DashboardStore>) {
		this.store = store;

		// Initialize state
		const currentPanel = store.getState().activePanel;
		const currentContext = this.contextMapping.get(currentPanel) || "task_tree";

		this.state = {
			currentContext,
			previousContext: null,
			lastNavigationTime: Date.now(),
			lastActionTime: Date.now(),
			idleStartTime: null,
			isIdle: false,
			navigationHistory: [],
		};

		this.startTracking();
	}

	/**
	 * Start tracking context changes and user activity
	 */
	private startTracking(): void {
		// Subscribe to store changes to detect navigation
		this.unsubscribe = this.store.subscribe((state, prevState) => {
			// Check for panel navigation
			if (state.activePanel !== prevState.activePanel) {
				this.handleNavigation(state.activePanel);
			}

			// Check for other activity indicators
			if (
				state.selectedTaskId !== prevState.selectedTaskId ||
				state.commandPaletteOpen !== prevState.commandPaletteOpen ||
				state.helpOverlayOpen !== prevState.helpOverlayOpen ||
				state.expandedTaskIds.size !== prevState.expandedTaskIds.size
			) {
				this.handleActivity();
			}
		});

		// Start idle detection timer
		this.resetIdleTimer();
	}

	/**
	 * Handle navigation between panels
	 */
	private handleNavigation(newPanel: DashboardStore["activePanel"]): void {
		const newContext = this.contextMapping.get(newPanel);
		if (!newContext || newContext === this.state.currentContext) {
			return;
		}

		const now = Date.now();
		const event: ContextEvent = {
			type: "navigation",
			context: newContext,
			timestamp: now,
			previousContext: this.state.currentContext,
		};

		// Update state
		this.state.previousContext = this.state.currentContext;
		this.state.currentContext = newContext;
		this.state.lastNavigationTime = now;
		this.state.lastActionTime = now;
		this.state.isIdle = false;
		this.state.idleStartTime = null;

		// Add to history
		this.addToHistory(event);

		// Notify listeners
		this.notifyListeners(event);

		// Reset idle timer
		this.resetIdleTimer();
	}

	/**
	 * Handle user activity (non-navigation actions)
	 */
	private handleActivity(): void {
		const now = Date.now();

		// Only record if we were idle or it's been a while since last action
		if (this.state.isIdle || now - this.state.lastActionTime > 1000) {
			const event: ContextEvent = {
				type: "action",
				context: this.state.currentContext,
				timestamp: now,
			};

			this.addToHistory(event);
			this.notifyListeners(event);
		}

		this.state.lastActionTime = now;
		this.state.isIdle = false;
		this.state.idleStartTime = null;

		// Reset idle timer
		this.resetIdleTimer();
	}

	/**
	 * Handle idle state detection
	 */
	private handleIdle(): void {
		const now = Date.now();

		if (!this.state.isIdle) {
			this.state.isIdle = true;
			this.state.idleStartTime = now;

			const event: ContextEvent = {
				type: "idle",
				context: this.state.currentContext,
				timestamp: now,
			};

			this.addToHistory(event);
			this.notifyListeners(event);
		}
	}

	/**
	 * Reset the idle detection timer
	 */
	private resetIdleTimer(): void {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
		}

		this.idleTimer = setTimeout(() => {
			this.handleIdle();
		}, this.IDLE_THRESHOLD_MS);
	}

	/**
	 * Add event to navigation history
	 */
	private addToHistory(event: ContextEvent): void {
		this.state.navigationHistory.push(event);

		// Trim history if it gets too long
		if (this.state.navigationHistory.length > this.MAX_HISTORY_LENGTH) {
			this.state.navigationHistory = this.state.navigationHistory.slice(
				-this.MAX_HISTORY_LENGTH,
			);
		}
	}

	/**
	 * Notify all listeners of a context event
	 */
	private notifyListeners(event: ContextEvent): void {
		this.listeners.forEach((listener) => {
			try {
				listener(event);
			} catch (error) {
				console.error("Error in context event listener:", error);
			}
		});
	}

	/**
	 * Get the current context state
	 */
	public getState(): Readonly<ContextState> {
		return { ...this.state };
	}

	/**
	 * Get the current pane context
	 */
	public getCurrentContext(): PaneContext {
		return this.state.currentContext;
	}

	/**
	 * Check if the user is currently idle
	 */
	public isIdle(): boolean {
		return this.state.isIdle;
	}

	/**
	 * Get time since last navigation (in milliseconds)
	 */
	public getTimeSinceLastNavigation(): number {
		return Date.now() - this.state.lastNavigationTime;
	}

	/**
	 * Get time since last action (in milliseconds)
	 */
	public getTimeSinceLastAction(): number {
		return Date.now() - this.state.lastActionTime;
	}

	/**
	 * Check if footer hints should be shown based on timing
	 */
	public shouldShowFooterHints(): boolean {
		// Show hints after 2 seconds of idle time or immediately after navigation
		return (
			this.state.isIdle ||
			this.getTimeSinceLastNavigation() >= this.IDLE_THRESHOLD_MS
		);
	}

	/**
	 * Get recent navigation history
	 */
	public getRecentHistory(maxEvents: number = 10): ContextEvent[] {
		return this.state.navigationHistory.slice(-maxEvents);
	}

	/**
	 * Get navigation patterns for hint scoring
	 */
	public getNavigationPatterns(): {
		frequentContexts: Map<PaneContext, number>;
		recentTransitions: Array<{
			from: PaneContext;
			to: PaneContext;
			count: number;
		}>;
	} {
		const frequentContexts = new Map<PaneContext, number>();
		const transitions = new Map<string, number>();

		// Analyze navigation history
		this.state.navigationHistory.forEach((event) => {
			// Count context frequency
			const count = frequentContexts.get(event.context) || 0;
			frequentContexts.set(event.context, count + 1);

			// Count transitions
			if (event.type === "navigation" && event.previousContext) {
				const transitionKey = `${event.previousContext}->${event.context}`;
				const transitionCount = transitions.get(transitionKey) || 0;
				transitions.set(transitionKey, transitionCount + 1);
			}
		});

		// Convert transitions to array format
		const recentTransitions = Array.from(transitions.entries())
			.map(([key, count]) => {
				const [from, to] = key.split("->") as [PaneContext, PaneContext];
				return { from, to, count };
			})
			.sort((a, b) => b.count - a.count);

		return { frequentContexts, recentTransitions };
	}

	/**
	 * Add a listener for context events
	 */
	public addEventListener(listener: (event: ContextEvent) => void): void {
		this.listeners.push(listener);
	}

	/**
	 * Remove a context event listener
	 */
	public removeEventListener(listener: (event: ContextEvent) => void): void {
		const index = this.listeners.indexOf(listener);
		if (index > -1) {
			this.listeners.splice(index, 1);
		}
	}

	/**
	 * Manually trigger activity (for external integrations)
	 */
	public recordActivity(): void {
		this.handleActivity();
	}

	/**
	 * Clean up resources
	 */
	public destroy(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}

		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}

		this.listeners = [];
	}
}
