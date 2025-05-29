import type blessed from "blessed";

export interface KeyBinding {
	keys: string[];
	description: string;
	action: () => void;
}

export interface Keymap {
	[actionName: string]: KeyBinding;
}

export type KeyContext =
	| "global"
	| "taskTree"
	| "projectSidebar"
	| "commandPalette"
	| "helpOverlay";

/**
 * KeymapService manages keyboard bindings across different UI contexts
 * Provides type-safe key binding and unbinding for blessed components
 */
export class KeymapService {
	private keymaps: Map<KeyContext, Keymap> = new Map();
	private boundElements: WeakMap<blessed.Widgets.BlessedElement, KeyContext[]> =
		new WeakMap();

	constructor() {
		this.initializeDefaultKeymaps();
	}

	private initializeDefaultKeymaps() {
		// Global keymaps available in all contexts
		this.keymaps.set("global", {
			quit: {
				keys: ["q", "C-c"],
				description: "Quit application (double tap)",
				action: () => {}, // Will be overridden
			},
			help: {
				keys: ["?"],
				description: "Show help overlay",
				action: () => {}, // Will be overridden
			},
			commandPalette: {
				keys: [":"],
				description: "Open command palette",
				action: () => {}, // Will be overridden
			},
			nextPanel: {
				keys: ["tab"],
				description: "Focus next panel",
				action: () => {}, // Will be overridden
			},
			prevPanel: {
				keys: ["S-tab", "btab"],
				description: "Focus previous panel",
				action: () => {}, // Will be overridden
			},
		});

		// Task tree specific keymaps
		this.keymaps.set("taskTree", {
			moveUp: {
				keys: ["up", "k"],
				description: "Move cursor up",
				action: () => {}, // Will be overridden
			},
			moveDown: {
				keys: ["down", "j"],
				description: "Move cursor down",
				action: () => {}, // Will be overridden
			},
			expand: {
				keys: ["right", "l"],
				description: "Expand node",
				action: () => {}, // Will be overridden
			},
			collapse: {
				keys: ["left", "h"],
				description: "Collapse node",
				action: () => {}, // Will be overridden
			},
			select: {
				keys: ["enter"],
				description: "Select/toggle node",
				action: () => {}, // Will be overridden
			},
			toggleComplete: {
				keys: ["space"],
				description: "Toggle task completion",
				action: () => {}, // Will be overridden
			},
			addSibling: {
				keys: ["a"],
				description: "Add sibling task",
				action: () => {}, // Will be overridden
			},
			addChild: {
				keys: ["A"],
				description: "Add child task",
				action: () => {}, // Will be overridden
			},
			deleteTask: {
				keys: ["D"],
				description: "Delete task (with confirmation)",
				action: () => {}, // Will be overridden
			},
			addDependency: {
				keys: ["b"],
				description: "Add dependency",
				action: () => {}, // Will be overridden
			},
			removeDependency: {
				keys: ["B"],
				description: "Remove dependency",
				action: () => {}, // Will be overridden
			},
			expandAll: {
				keys: ["*"],
				description: "Expand all nodes",
				action: () => {}, // Will be overridden
			},
			collapseAll: {
				keys: ["_"],
				description: "Collapse all nodes",
				action: () => {}, // Will be overridden
			},
		});

		// Project sidebar keymaps
		this.keymaps.set("projectSidebar", {
			selectProject: {
				keys: ["enter"],
				description: "Select project",
				action: () => {}, // Will be overridden
			},
			moveUp: {
				keys: ["up", "k"],
				description: "Move up",
				action: () => {}, // Will be overridden
			},
			moveDown: {
				keys: ["down", "j"],
				description: "Move down",
				action: () => {}, // Will be overridden
			},
		});

		// Command palette keymaps
		this.keymaps.set("commandPalette", {
			close: {
				keys: ["escape"],
				description: "Close command palette",
				action: () => {}, // Will be overridden
			},
			execute: {
				keys: ["enter"],
				description: "Execute command",
				action: () => {}, // Will be overridden
			},
			moveUp: {
				keys: ["up"],
				description: "Move selection up",
				action: () => {}, // Will be overridden
			},
			moveDown: {
				keys: ["down"],
				description: "Move selection down",
				action: () => {}, // Will be overridden
			},
		});

		// Help overlay keymaps
		this.keymaps.set("helpOverlay", {
			close: {
				keys: ["escape", "q", "?"],
				description: "Close help overlay",
				action: () => {}, // Will be overridden
			},
			scrollUp: {
				keys: ["up", "k"],
				description: "Scroll up",
				action: () => {}, // Will be overridden
			},
			scrollDown: {
				keys: ["down", "j"],
				description: "Scroll down",
				action: () => {}, // Will be overridden
			},
		});
	}

	/**
	 * Get a keymap for a specific context
	 */
	getKeymap(context: KeyContext): Keymap {
		return this.keymaps.get(context) || {};
	}

	/**
	 * Get all available keymaps
	 */
	getAllKeymaps(): Map<KeyContext, Keymap> {
		return new Map(this.keymaps);
	}

	/**
	 * Bind keys for a specific context to a blessed element
	 * This provides type-safe key binding with automatic cleanup tracking
	 */
	bindKeys(
		element: blessed.Widgets.BlessedElement,
		context: KeyContext,
		handlers: Partial<Record<keyof Keymap, () => void>>,
	): void {
		const keymap = this.getKeymap(context);

		// Track bound contexts for cleanup
		const existingContexts = this.boundElements.get(element) || [];
		this.boundElements.set(element, [...existingContexts, context]);

		// Bind each action's keys to the provided handler
		for (const [action, config] of Object.entries(keymap)) {
			const handler = handlers[action as keyof Keymap];
			if (handler && typeof handler === "function") {
				element.key(config.keys, handler);
			}
		}
	}

	/**
	 * Unbind all keys for a specific context from an element
	 */
	unbindKeys(
		element: blessed.Widgets.BlessedElement,
		context: KeyContext,
	): void {
		// Note: blessed doesn't provide a reliable way to unbind specific handlers
		// This is a limitation of the blessed library itself
		// In practice, components should handle their own cleanup on destroy

		// Update tracked contexts
		const existingContexts = this.boundElements.get(element) || [];
		const updatedContexts = existingContexts.filter((c) => c !== context);
		this.boundElements.set(element, updatedContexts);
	}

	/**
	 * Unbind all keys from an element (useful for cleanup)
	 */
	unbindAllKeys(element: blessed.Widgets.BlessedElement): void {
		const contexts = this.boundElements.get(element) || [];
		contexts.forEach((context) => this.unbindKeys(element, context));
	}

	/**
	 * Get the key bindings for a specific action in a context
	 */
	getKeysForAction(context: KeyContext, action: string): string[] {
		const keymap = this.getKeymap(context);
		return keymap[action]?.keys || [];
	}

	/**
	 * Get the description for a specific action in a context
	 */
	getDescriptionForAction(context: KeyContext, action: string): string {
		const keymap = this.getKeymap(context);
		return keymap[action]?.description || "";
	}

	/**
	 * Update the action handler for a specific key binding
	 */
	setActionHandler(
		context: KeyContext,
		action: string,
		handler: () => void,
	): void {
		const keymap = this.keymaps.get(context);
		if (keymap && keymap[action]) {
			keymap[action].action = handler;
		}
	}

	/**
	 * Get all key bindings for a context formatted for display
	 */
	getFormattedBindings(
		context: KeyContext,
	): Array<{ keys: string; description: string }> {
		const keymap = this.getKeymap(context);
		return Object.values(keymap).map((binding) => ({
			keys: binding.keys.join(", "),
			description: binding.description,
		}));
	}

	/**
	 * Check if a key combination is bound in any context
	 */
	isKeyBound(key: string, contexts: KeyContext[] = []): boolean {
		const contextsToCheck =
			contexts.length > 0 ? contexts : Array.from(this.keymaps.keys());

		return contextsToCheck.some((context) => {
			const keymap = this.getKeymap(context);
			return Object.values(keymap).some((binding) =>
				binding.keys.includes(key),
			);
		});
	}
}
