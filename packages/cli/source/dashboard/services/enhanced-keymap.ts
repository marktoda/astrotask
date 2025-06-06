import type blessed from "blessed";
import { KeyMapRegistry } from "./keymap-registry.js";
import type {
  EnhancedKeyBinding,
  PaneContext,
  DiscoveryConfig,
  KeyBindingRegistryEntry,
} from "../types/keybinding.js";

// Re-export legacy types for backward compatibility
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
 * Enhanced KeymapService that integrates the new KeyMapRegistry
 * while maintaining backward compatibility with existing components
 */
export class EnhancedKeymapService {
  private registry: KeyMapRegistry;
  private boundElements: WeakMap<blessed.Widgets.BlessedElement, KeyContext[]> = new WeakMap();
  
  // Legacy context to new context mapping
  private contextMapping: Map<KeyContext, PaneContext> = new Map([
    ["global", "global"],
    ["taskTree", "task_tree"],
    ["projectSidebar", "project_list"],
    ["commandPalette", "command_palette"],
    ["helpOverlay", "help_overlay"],
  ]);

  constructor(config?: Partial<DiscoveryConfig>) {
    this.registry = new KeyMapRegistry(config);
    this.initializeDefaultKeybindings();
  }

  /**
   * Initialize all default keybindings using the new registry system
   */
  private initializeDefaultKeybindings(): void {
    // Global keybindings
    this.registerBinding({
      key: "q",
      aliases: ["C-c"],
      context: "global",
      description: "Quit application (double tap)",
      hint: "quit",
      weight: 10,
      priority: "high",
      category: "Navigation",
      tags: ["exit", "quit"],
      showInOnboarding: true,
      action: () => {}, // Will be overridden
    });

    this.registerBinding({
      key: "?",
      context: "global",
      description: "Show help overlay",
      hint: "help",
      weight: 8,
      priority: "medium",
      category: "Help",
      tags: ["help", "reference"],
      showInOnboarding: true,
      action: () => {},
    });

    this.registerBinding({
      key: ":",
      context: "global",
      description: "Open command palette",
      hint: "cmd",
      weight: 6,
      priority: "medium",
      category: "Navigation",
      tags: ["command", "palette"],
      showInOnboarding: true,
      action: () => {},
    });

    this.registerBinding({
      key: "tab",
      context: "global",
      description: "Focus next panel",
      hint: "next",
      weight: 7,
      priority: "medium",
      category: "Navigation",
      tags: ["focus", "navigation"],
      action: () => {},
    });

    this.registerBinding({
      key: "S-tab",
      aliases: ["btab"],
      context: "global",
      description: "Focus previous panel",
      hint: "prev",
      weight: 5,
      priority: "medium",
      category: "Navigation",
      tags: ["focus", "navigation"],
      action: () => {},
    });

    // Task tree keybindings
    this.registerBinding({
      key: "up",
      aliases: ["k"],
      context: "task_tree",
      description: "Move cursor up",
      hint: "↑",
      weight: 9,
      priority: "high",
      category: "Navigation",
      tags: ["move", "cursor"],
      showInOnboarding: true,
      action: () => {},
    });

    this.registerBinding({
      key: "down",
      aliases: ["j"],
      context: "task_tree",
      description: "Move cursor down",
      hint: "↓",
      weight: 9,
      priority: "high",
      category: "Navigation",
      tags: ["move", "cursor"],
      showInOnboarding: true,
      action: () => {},
    });

    this.registerBinding({
      key: "right",
      aliases: ["l"],
      context: "task_tree",
      description: "Expand node",
      hint: "expand",
      weight: 6,
      priority: "medium",
      category: "Tree",
      tags: ["expand", "tree"],
      action: () => {},
    });

    this.registerBinding({
      key: "left",
      aliases: ["h"],
      context: "task_tree",
      description: "Collapse node",
      hint: "collapse",
      weight: 6,
      priority: "medium",
      category: "Tree",
      tags: ["collapse", "tree"],
      action: () => {},
    });

    this.registerBinding({
      key: "enter",
      context: "task_tree",
      description: "Select/toggle node",
      hint: "select",
      weight: 8,
      priority: "high",
      category: "Actions",
      tags: ["select", "toggle"],
      showInOnboarding: true,
      action: () => {},
    });

    this.registerBinding({
      key: "space",
      context: "task_tree",
      description: "Toggle task completion",
      hint: "✓ toggle",
      weight: 9,
      priority: "high",
      category: "Tasks",
      tags: ["complete", "toggle"],
      showInOnboarding: true,
      action: () => {},
    });

    this.registerBinding({
      key: "a",
      context: "task_tree",
      description: "Add sibling task with editor",
      hint: "add sibling",
      weight: 7,
      priority: "medium",
      category: "Tasks",
      tags: ["add", "create", "editor"],
      showInOnboarding: true,
      action: () => {},
    });

    this.registerBinding({
      key: "A",
      context: "task_tree",
      description: "Add child task with editor",
      hint: "add child",
      weight: 6,
      priority: "medium",
      category: "Tasks",
      tags: ["add", "create", "child", "editor"],
      action: () => {},
    });

    this.registerBinding({
      key: "e",
      context: "task_tree",
      description: "Edit task with editor",
      hint: "edit",
      weight: 7,
      priority: "medium",
      category: "Tasks",
      tags: ["edit", "modify", "editor"],
      action: () => {},
    });

    this.registerBinding({
      key: "D",
      context: "task_tree",
      description: "Delete task (with confirmation)",
      hint: "delete",
      weight: 4,
      priority: "low",
      category: "Tasks",
      tags: ["delete", "remove"],
      action: () => {},
    });

    this.registerBinding({
      key: "b",
      context: "task_tree",
      description: "Add dependency",
      hint: "dep +",
      weight: 3,
      priority: "low",
      category: "Dependencies",
      tags: ["dependency", "link"],
      action: () => {},
    });

    this.registerBinding({
      key: "B",
      context: "task_tree",
      description: "Remove dependency",
      hint: "dep -",
      weight: 3,
      priority: "low",
      category: "Dependencies",
      tags: ["dependency", "unlink"],
      action: () => {},
    });

    this.registerBinding({
      key: "*",
      context: "task_tree",
      description: "Expand all nodes",
      hint: "expand all",
      weight: 2,
      priority: "low",
      category: "Tree",
      tags: ["expand", "all"],
      action: () => {},
    });

    this.registerBinding({
      key: "_",
      context: "task_tree",
      description: "Collapse all nodes",
      hint: "collapse all",
      weight: 2,
      priority: "low",
      category: "Tree",
      tags: ["collapse", "all"],
      action: () => {},
    });

    // Project sidebar keybindings
    this.registerBinding({
      key: "enter",
      context: "project_list",
      description: "Select project",
      hint: "select",
      weight: 8,
      priority: "high",
      category: "Projects",
      tags: ["select", "project"],
      action: () => {},
    });

    this.registerBinding({
      key: "up",
      aliases: ["k"],
      context: "project_list",
      description: "Move up",
      hint: "↑",
      weight: 7,
      priority: "medium",
      category: "Navigation",
      tags: ["move", "cursor"],
      action: () => {},
    });

    this.registerBinding({
      key: "down",
      aliases: ["j"],
      context: "project_list",
      description: "Move down",
      hint: "↓",
      weight: 7,
      priority: "medium",
      category: "Navigation",
      tags: ["move", "cursor"],
      action: () => {},
    });

    // Command palette keybindings
    this.registerBinding({
      key: "escape",
      context: "command_palette",
      description: "Close command palette",
      hint: "close",
      weight: 9,
      priority: "high",
      category: "Navigation",
      tags: ["close", "cancel"],
      action: () => {},
    });

    this.registerBinding({
      key: "enter",
      context: "command_palette",
      description: "Execute command",
      hint: "execute",
      weight: 10,
      priority: "high",
      category: "Actions",
      tags: ["execute", "run"],
      action: () => {},
    });

    this.registerBinding({
      key: "up",
      context: "command_palette",
      description: "Move selection up",
      hint: "↑",
      weight: 7,
      priority: "medium",
      category: "Navigation",
      tags: ["move", "selection"],
      action: () => {},
    });

    this.registerBinding({
      key: "down",
      context: "command_palette",
      description: "Move selection down",
      hint: "↓",
      weight: 7,
      priority: "medium",
      category: "Navigation",
      tags: ["move", "selection"],
      action: () => {},
    });

    // Help overlay keybindings
    this.registerBinding({
      key: "escape",
      aliases: ["q", "?"],
      context: "help_overlay",
      description: "Close help overlay",
      hint: "close",
      weight: 9,
      priority: "high",
      category: "Navigation",
      tags: ["close", "exit"],
      action: () => {},
    });

    this.registerBinding({
      key: "up",
      aliases: ["k"],
      context: "help_overlay",
      description: "Scroll up",
      hint: "scroll ↑",
      weight: 5,
      priority: "medium",
      category: "Navigation",
      tags: ["scroll", "up"],
      action: () => {},
    });

    this.registerBinding({
      key: "down",
      aliases: ["j"],
      context: "help_overlay",
      description: "Scroll down",
      hint: "scroll ↓",
      weight: 5,
      priority: "medium",
      category: "Navigation",
      tags: ["scroll", "down"],
      action: () => {},
    });
  }

  /**
   * Register a new enhanced keybinding
   */
  private registerBinding(binding: EnhancedKeyBinding): string {
    return this.registry.register(binding);
  }

  /**
   * Get the registry instance for advanced operations
   */
  public getRegistry(): KeyMapRegistry {
    return this.registry;
  }

  /**
   * Legacy API: Get a keymap for a specific context
   */
  getKeymap(context: KeyContext): Keymap {
    const newContext = this.contextMapping.get(context);
    if (!newContext) return {};

    const entries = this.registry.getByContext(newContext);
    const keymap: Keymap = {};

    for (const entry of entries) {
      const binding = entry.binding;
      // Convert back to legacy format for backward compatibility
      const actionName = this.generateActionName(binding);
      keymap[actionName] = {
        keys: [binding.key, ...(binding.aliases || [])],
        description: binding.description,
        action: binding.action,
      };
    }

    return keymap;
  }

  /**
   * Generate a consistent action name from a binding
   */
  private generateActionName(binding: EnhancedKeyBinding): string {
    // Create a consistent action name based on description
    return binding.description
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Legacy API: Get all available keymaps
   */
  getAllKeymaps(): Map<KeyContext, Keymap> {
    const keymaps = new Map<KeyContext, Keymap>();
    
    for (const [legacyContext, _newContext] of this.contextMapping) {
      keymaps.set(legacyContext, this.getKeymap(legacyContext));
    }

    return keymaps;
  }

  /**
   * Legacy API: Bind keys for a specific context to a blessed element
   */
  bindKeys(
    element: blessed.Widgets.BlessedElement,
    context: KeyContext,
    handlers: Partial<Record<keyof Keymap, () => void>>,
  ): void {
    const newContext = this.contextMapping.get(context);
    if (!newContext) return;

    const entries = this.registry.getByContext(newContext);

    // Track bound contexts for cleanup
    const existingContexts = this.boundElements.get(element) || [];
    this.boundElements.set(element, [...existingContexts, context]);

    // Bind each keybinding
    for (const entry of entries) {
      const binding = entry.binding;
      const actionName = this.generateActionName(binding);
      const handler = handlers[actionName];

      if (handler && typeof handler === "function") {
        // Bind primary key
        element.key([binding.key], () => {
          this.registry.recordUsage(entry.id);
          handler();
        });

        // Bind aliases
        if (binding.aliases && binding.aliases.length > 0) {
          element.key(binding.aliases, () => {
            this.registry.recordUsage(entry.id);
            handler();
          });
        }

        // Update the action in the registry
        binding.action = () => {
          this.registry.recordUsage(entry.id);
          handler();
        };
      }
    }
  }

  /**
   * Legacy API: Unbind all keys for a specific context from an element
   */
  unbindKeys(
    element: blessed.Widgets.BlessedElement,
    context: KeyContext,
  ): void {
    // Update tracked contexts
    const existingContexts = this.boundElements.get(element) || [];
    const updatedContexts = existingContexts.filter((c) => c !== context);
    this.boundElements.set(element, updatedContexts);
  }

  /**
   * Legacy API: Unbind all keys from an element
   */
  unbindAllKeys(element: blessed.Widgets.BlessedElement): void {
    const contexts = this.boundElements.get(element) || [];
    contexts.forEach((context) => this.unbindKeys(element, context));
  }

  /**
   * Legacy API: Get the key bindings for a specific action in a context
   */
  getKeysForAction(context: KeyContext, action: string): string[] {
    const keymap = this.getKeymap(context);
    return keymap[action]?.keys || [];
  }

  /**
   * Legacy API: Get the description for a specific action in a context
   */
  getDescriptionForAction(context: KeyContext, action: string): string {
    const keymap = this.getKeymap(context);
    return keymap[action]?.description || "";
  }

  /**
   * Legacy API: Update the action handler for a specific key binding
   */
  setActionHandler(
    context: KeyContext,
    action: string,
    handler: () => void,
  ): void {
    const newContext = this.contextMapping.get(context);
    if (!newContext) return;

    const entries = this.registry.getByContext(newContext);
    
    for (const entry of entries) {
      const actionName = this.generateActionName(entry.binding);
      if (actionName === action) {
        entry.binding.action = () => {
          this.registry.recordUsage(entry.id);
          handler();
        };
        break;
      }
    }
  }

  /**
   * Legacy API: Get all key bindings for a context formatted for display
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
   * Legacy API: Check if a key combination is bound in any context
   */
  isKeyBound(key: string, contexts: KeyContext[] = []): boolean {
    const newContexts = contexts.length > 0 
      ? contexts.map(c => this.contextMapping.get(c)).filter(Boolean) as PaneContext[]
      : Array.from(this.contextMapping.values());

    return newContexts.some(context => {
      return this.registry.findByKey(key, context) !== undefined;
    });
  }

  /**
   * Enhanced API: Get footer hints for a context
   */
  getFooterHints(context: KeyContext): Array<{ 
    key: string; 
    description: string; 
    hint: string; 
  }> {
    const newContext = this.contextMapping.get(context);
    if (!newContext) return [];

    return this.registry.getFooterHints(newContext).map(entry => ({
      key: entry.binding.key,
      description: entry.binding.description,
      hint: entry.binding.hint || entry.binding.description,
    }));
  }

  /**
   * Enhanced API: Get keybindings for the key ring overlay
   */
  getKeyRingBindings(context: KeyContext): KeyBindingRegistryEntry[] {
    const newContext = this.contextMapping.get(context);
    if (!newContext) return [];

    return this.registry.getByContext(newContext);
  }

  /**
   * Enhanced API: Find a keybinding by key
   */
  findBindingByKey(key: string, context: KeyContext): KeyBindingRegistryEntry | undefined {
    const newContext = this.contextMapping.get(context);
    if (!newContext) return undefined;

    return this.registry.findByKey(key, newContext);
  }

  /**
   * Enhanced API: Get usage statistics
   */
  getUsageStats() {
    return this.registry.getUsageStats();
  }

  /**
   * Enhanced API: Get discovery metrics
   */
  getMetrics() {
    return this.registry.getMetrics();
  }

  /**
   * Enhanced API: Update configuration
   */
  updateConfig(config: Partial<DiscoveryConfig>): void {
    this.registry.updateConfig(config);
  }

  /**
   * Enhanced API: Get current configuration
   */
  getConfig(): DiscoveryConfig {
    return this.registry.getConfig();
  }
} 