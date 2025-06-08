/**
 * Enhanced KeyBinding interfaces for the Astrolabe TUI Keybinding Discovery System
 * These extend the existing keymap system with progressive disclosure capabilities
 */

/**
 * Context enum defining different panes in the dashboard
 * Extends the existing KeyContext from KeymapService
 */
export type PaneContext =
	| "task_tree"
	| "project_list"
	| "global"
	| "command_palette"
	| "help_overlay"
	| "task_detail"
	| "search"
	| "settings";

/**
 * Priority levels for keybindings - affects footer hint scoring
 */
export type KeyBindingPriority = "low" | "medium" | "high";

/**
 * Status for tracking discovery state
 */
export type DiscoveryStatus = "new" | "seen" | "learned";

/**
 * Enhanced KeyBinding interface for the discovery system
 * Extends the existing KeyBinding with additional metadata
 */
export interface EnhancedKeyBinding {
	/** The key combination (e.g., 'a', 'Shift+A', 'Ctrl+C') */
	key: string;

	/** Alternative key combinations for the same action */
	aliases?: string[];

	/** Context where this binding is active */
	context: PaneContext;

	/** Human-readable description of the action */
	description: string;

	/** Short hint text for footer display */
	hint?: string;

	/** Weight for scoring in footer hints (higher = more important) */
	weight?: number;

	/** Priority level affects discovery order */
	priority?: KeyBindingPriority;

	/** Category for grouping in help systems */
	category?: string;

	/** Tags for search and filtering */
	tags?: string[];

	/** Whether this binding should appear in onboarding */
	showInOnboarding?: boolean;

	/** Condition function to determine if binding is currently available */
	condition?: () => boolean;

	/** The actual action handler */
	action: () => void | Promise<void>;
}

/**
 * Scoring factors for footer hint ranking
 */
export interface HintScoringFactors {
	/** Base weight from the keybinding definition */
	weight: number;

	/** Recent usage factor (higher = used recently) */
	recencyFactor: number;

	/** Context relevance factor */
	contextRelevance: number;

	/** User learning stage factor */
	learningFactor: number;

	/** Final computed score */
	totalScore: number;
}

/**
 * Data structure for footer hints
 */
export interface FooterHint {
	/** The keybinding this hint represents */
	binding: EnhancedKeyBinding;

	/** Computed scoring factors */
	scoring: HintScoringFactors;

	/** Display text for the hint */
	displayText: string;

	/** Key text for display (may be shortened) */
	keyText: string;
}

/**
 * Onboarding tooltip data
 */
export interface OnboardingTooltip {
	/** Associated keybinding */
	binding: EnhancedKeyBinding;

	/** Tooltip text (may differ from description) */
	text: string;

	/** Position relative to UI element */
	position: "left" | "right" | "above" | "below";

	/** Whether this tooltip has been shown */
	shown: boolean;

	/** Number of times shown */
	showCount: number;
}

/**
 * Context tracking data
 */
export interface ContextState {
	/** Current active pane */
	currentContext: PaneContext;

	/** Context history for recency calculation */
	contextHistory: Array<{
		context: PaneContext;
		timestamp: number;
	}>;

	/** Time of last user action */
	lastActionTime: number;

	/** Whether user is currently idle */
	isIdle: boolean;

	/** Current idle duration in milliseconds */
	idleDuration: number;
}

/**
 * Key ring overlay display data
 */
export interface KeyRingOverlay {
	/** Keybindings to display in the overlay */
	bindings: EnhancedKeyBinding[];

	/** Layout mode based on terminal size */
	layoutMode: "radial" | "stacked";

	/** Whether overlay is currently visible */
	visible: boolean;

	/** Position and size information */
	geometry: {
		centerX: number;
		centerY: number;
		width: number;
		height: number;
	};
}

/**
 * Configuration options for the discovery system
 */
export interface DiscoveryConfig {
	/** Whether to show footer hints */
	footerHints: boolean;

	/** Key combination to trigger key ring overlay */
	keyringTrigger: string;

	/** Whether to show onboarding tooltips */
	onboarding: boolean;

	/** Minimum idle time before showing hints (ms) */
	hintIdleTime: number;

	/** Duration to hold trigger key for overlay (ms) */
	triggerHoldTime: number;

	/** Maximum number of footer hints to show */
	maxFooterHints: number;

	/** Whether to show unknown key toasts */
	unknownKeyToasts: boolean;
}

/**
 * Usage statistics for metrics tracking
 */
export interface KeyBindingUsageStats {
	/** Binding identifier */
	bindingId: string;

	/** Number of times used */
	usageCount: number;

	/** Last used timestamp */
	lastUsed: number;

	/** Discovery status */
	discoveryStatus: DiscoveryStatus;

	/** Time to first use after discovery */
	timeToFirstUse?: number;

	/** Context when first discovered */
	discoveryContext: PaneContext;
}

/**
 * Registry entry combining binding with metadata
 */
export interface KeyBindingRegistryEntry {
	/** Unique identifier for this binding */
	id: string;

	/** The enhanced keybinding definition */
	binding: EnhancedKeyBinding;

	/** Usage statistics */
	stats: KeyBindingUsageStats;

	/** Whether this binding is currently active */
	active: boolean;

	/** Registration timestamp */
	registered: number;
}

/**
 * Events emitted by the discovery system
 */
export interface DiscoveryEvents {
	/** Fired when context changes */
	contextChange: {
		from: PaneContext;
		to: PaneContext;
		timestamp: number;
	};

	/** Fired when keybinding is used */
	bindingUsed: {
		bindingId: string;
		context: PaneContext;
		timestamp: number;
	};

	/** Fired when user becomes idle */
	userIdle: {
		duration: number;
		context: PaneContext;
	};

	/** Fired when key ring overlay is shown */
	overlayShown: {
		context: PaneContext;
		bindingCount: number;
	};

	/** Fired when unknown key is pressed */
	unknownKey: {
		key: string;
		context: PaneContext;
	};
}

/**
 * Options for querying keybindings from the registry
 */
export interface KeyBindingQuery {
	/** Filter by context */
	context?: PaneContext;

	/** Filter by category */
	category?: string;

	/** Filter by tags */
	tags?: string[];

	/** Filter by priority */
	priority?: KeyBindingPriority;

	/** Only return active bindings */
	activeOnly?: boolean;

	/** Sort by usage count */
	sortByUsage?: boolean;

	/** Limit number of results */
	limit?: number;
}
