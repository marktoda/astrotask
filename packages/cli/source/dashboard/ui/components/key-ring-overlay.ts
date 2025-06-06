import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";
import type { EnhancedKeymapService } from "../../services/enhanced-keymap.js";
import { OverlayLayoutEngine, type LayoutResult, type KeyRingItem } from "../../services/overlay-layout.js";
import type { EnhancedKeyBinding, PaneContext } from "../../types/keybinding.js";

export interface KeyRingOverlayConfig {
  /** Duration to show overlay in milliseconds */
  displayDuration?: number;
  /** Whether to auto-hide on key press */
  autoHideOnKeyPress?: boolean;
  /** Background opacity (0-100) */
  backgroundOpacity?: number;
}

/**
 * Key Ring Overlay component that displays available keybindings in a responsive layout
 * triggered by Ctrl-K hold detection. Uses blessed.js for rendering with transparent background.
 */
export class KeyRingOverlay {
  private screen: blessed.Widgets.Screen;
  private store: StoreApi<DashboardStore>;
  private keymapService: EnhancedKeymapService;
  private layoutEngine: OverlayLayoutEngine;
  private config: Required<KeyRingOverlayConfig>;
  
  private overlayBox: blessed.Widgets.BoxElement | null = null;
  private itemBoxes: blessed.Widgets.BoxElement[] = [];
  private isVisible = false;
  private hideTimer: NodeJS.Timeout | null = null;
  private currentLayout: LayoutResult | null = null;

  constructor(
    screen: blessed.Widgets.Screen,
    store: StoreApi<DashboardStore>,
    keymapService: EnhancedKeymapService,
    config?: KeyRingOverlayConfig
  ) {
    this.screen = screen;
    this.store = store;
    this.keymapService = keymapService;
    this.layoutEngine = new OverlayLayoutEngine();
    
    this.config = {
      displayDuration: 5000, // 5 seconds
      autoHideOnKeyPress: true,
      backgroundOpacity: 20,
      ...config,
    };

    this.setupKeyHandlers();
  }

  /**
   * Show the key ring overlay for the current context
   */
  show(): void {
    if (this.isVisible) {
      return;
    }

    // Get current context and relevant keybindings
    const currentContext = this.getCurrentContext();
    const bindings = this.getContextKeybindings(currentContext);
    
    if (bindings.length === 0) {
      // No bindings to show
      this.store.getState().setStatusMessage("No keybindings available for current context");
      return;
    }

    // Calculate layout
    const terminalWidth = this.screen.width as number;
    const terminalHeight = this.screen.height as number;
    this.currentLayout = this.layoutEngine.calculateLayout(bindings, terminalWidth, terminalHeight);

    // Create and show overlay
    this.createOverlay();
    this.renderItems();
    this.isVisible = true;

    // Set up auto-hide timer
    if (this.config.displayDuration > 0) {
      this.hideTimer = setTimeout(() => {
        this.hide();
      }, this.config.displayDuration);
    }

    // Render the screen
    this.screen.render();

    // Debug logging
    if (process.env["DEBUG_KEYS"]) {
      console.error(`DEBUG: Key ring overlay shown - ${this.currentLayout.mode} layout with ${this.currentLayout.totalItems} items`);
    }
  }

  /**
   * Hide the key ring overlay
   */
  hide(): void {
    if (!this.isVisible) {
      return;
    }

    this.cleanup();
    this.isVisible = false;
    this.screen.render();

    if (process.env["DEBUG_KEYS"]) {
      console.error("DEBUG: Key ring overlay hidden");
    }
  }

  /**
   * Check if overlay is currently visible
   */
  isShowing(): boolean {
    return this.isVisible;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<KeyRingOverlayConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Destroy the overlay and clean up resources
   */
  destroy(): void {
    this.hide();
  }

  private getCurrentContext(): PaneContext {
    const state = this.store.getState();
    
    // Map dashboard panel to pane context
    switch (state.activePanel) {
      case "tree":
        return "task_tree";
      case "sidebar":
        return "project_list";
      case "details":
        return "task_detail";
      default:
        return "global";
    }
  }

  private getContextKeybindings(context: PaneContext): EnhancedKeyBinding[] {
    const registry = this.keymapService.getRegistry();
    
    // Get bindings for current context and global context
    const contextBindings = registry.getByContext(context);
    const globalBindings = registry.getByContext("global");
    
    // Combine and deduplicate
    const allBindings = [...contextBindings, ...globalBindings];
    const uniqueBindings = allBindings.filter((binding, index, array) => 
      array.findIndex(b => b.binding.key === binding.binding.key) === index
    );

    // Filter out bindings that don't have actions or are not currently available
    return uniqueBindings
      .filter(entry => entry.active && entry.binding.action)
      .filter(entry => !entry.binding.condition || entry.binding.condition())
      .map(entry => entry.binding)
      .slice(0, 12); // Limit to 12 items for better UX
  }

  private createOverlay(): void {
    if (!this.currentLayout) return;

    const { overlay } = this.currentLayout;
    
    // Create main overlay container
    this.overlayBox = blessed.box({
      parent: this.screen,
      top: Math.floor(overlay.centerY - overlay.height / 2) as any,
      left: Math.floor(overlay.centerX - overlay.width / 2) as any,
      width: overlay.width as any,
      height: overlay.height as any,
      style: {
        bg: "black",
        fg: "white",
        transparent: this.config.backgroundOpacity < 100,
      },
      border: {
        type: "line",
      },
      shadow: true,
      tags: true,
    });

    // Add title
    const title = `Key Ring (${this.currentLayout.mode} layout)`;
    this.overlayBox.setContent(`{center}${title}{/center}`);
  }

  private renderItems(): void {
    if (!this.currentLayout || !this.overlayBox) return;

    this.itemBoxes = [];

    this.currentLayout.items.forEach((item: KeyRingItem, index: number) => {
      const itemBox = blessed.box({
        parent: this.overlayBox as any,
        top: item.position.y as any,
        left: item.position.x as any,
        width: item.position.width as any,
        height: item.position.height as any,
        style: {
          bg: index % 2 === 0 ? "blue" : "magenta",
          fg: "white",
          bold: true,
        },
        border: {
          type: "line",
        },
        tags: true,
        padding: {
          left: 1,
          right: 1,
        },
      });

      // Format content: [Key] Description
      const content = `{bold}${item.keyText}{/bold} ${item.displayText}`;
      itemBox.setContent(content);

      this.itemBoxes.push(itemBox);
    });
  }

  private setupKeyHandlers(): void {
    // Handle key presses while overlay is visible
    this.screen.on("keypress", (_ch: string, key: any) => {
      if (!this.isVisible) return;

      // Always hide on escape
      if (key && key.name === "escape") {
        this.hide();
        return;
      }

      // Try to execute command for the pressed key
      if (key && this.tryExecuteCommand(key)) {
        // Command was executed, hide overlay
        this.hide();
        return;
      }

      // Hide on any key if auto-hide is enabled and no command was executed
      if (this.config.autoHideOnKeyPress) {
        this.hide();
      }
    });
  }

  /**
   * Try to execute a command for the given key press
   * Returns true if a command was found and executed
   */
  private tryExecuteCommand(key: any): boolean {
    if (!key || !this.currentLayout) return false;

    // Get current context
    const currentContext = this.getCurrentContext();
    
    // Normalize the key to match our binding format
    const normalizedKey = this.normalizeKey(key);
    if (!normalizedKey) return false;

    // Try to find binding in current context first
    let binding = this.keymapService.findBindingByKey(normalizedKey, this.mapPaneToKeyContext(currentContext));
    
    // If not found in current context, try global context
    if (!binding) {
      binding = this.keymapService.findBindingByKey(normalizedKey, "global");
    }

    // Execute the action if found
    if (binding && binding.binding.action) {
      try {
        // Check condition if provided
        if (binding.binding.condition && !binding.binding.condition()) {
          return false;
        }

        // Execute the action
        const result = binding.binding.action();
        
        // Handle async actions
        if (result instanceof Promise) {
          result.catch(error => {
            console.error(`Error executing keybinding action for "${normalizedKey}":`, error);
            this.store.getState().setStatusMessage(`Error executing command: ${error.message}`);
          });
        }

        // Debug logging
        if (process.env["DEBUG_KEYS"]) {
          console.error(`DEBUG: Executed command "${binding.binding.description}" for key "${normalizedKey}"`);
        }

        // Show feedback
        this.store.getState().setStatusMessage(`Executed: ${binding.binding.description}`);
        
        return true;
      } catch (error) {
        console.error(`Error executing keybinding action for "${normalizedKey}":`, error);
        this.store.getState().setStatusMessage(`Error executing command: ${(error as Error).message}`);
        return false;
      }
    }

    return false;
  }

  /**
   * Normalize blessed key object to our binding format
   */
  private normalizeKey(key: any): string | null {
    if (!key) return null;

    // Handle special keys
    const specialKeys: Record<string, string> = {
      "return": "enter",
      "backspace": "backspace",
      "delete": "delete",
      "tab": "tab",
      "escape": "escape",
      "space": "space",
      "up": "up",
      "down": "down",
      "left": "left",
      "right": "right",
      "home": "home",
      "end": "end",
      "pageup": "pageup",
      "pagedown": "pagedown",
    };

    let keyStr = "";

    // Add modifiers
    if (key.ctrl) keyStr += "c-";
    if (key.shift && key.name !== key.name?.toLowerCase()) keyStr += "S-";
    if (key.meta) keyStr += "m-";

    // Add the key name
    if (key.name && specialKeys[key.name]) {
      keyStr += specialKeys[key.name];
    } else if (key.name) {
      keyStr += key.name;
    } else if (key.sequence) {
      // Fallback to sequence for printable characters
      keyStr += key.sequence;
    } else {
      return null;
    }

    return keyStr;
  }

  /**
   * Map PaneContext to KeyContext for backward compatibility
   */
  private mapPaneToKeyContext(paneContext: PaneContext): import("../../services/enhanced-keymap.js").KeyContext {
    const mapping: Record<PaneContext, import("../../services/enhanced-keymap.js").KeyContext> = {
      "task_tree": "taskTree",
      "project_list": "projectSidebar", 
      "global": "global",
      "command_palette": "commandPalette",
      "help_overlay": "helpOverlay",
      "task_detail": "global", // Map to global as fallback
      "search": "global", // Map to global as fallback
      "settings": "global", // Map to global as fallback
    };

    return mapping[paneContext] || "global";
  }

  private cleanup(): void {
    // Clear hide timer
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    // Remove item boxes
    this.itemBoxes.forEach(box => {
      if (box.parent) {
        (box.parent as any).remove(box);
      }
    });
    this.itemBoxes = [];

    // Remove overlay box
    if (this.overlayBox && this.overlayBox.parent) {
      (this.overlayBox.parent as any).remove(this.overlayBox);
      this.overlayBox = null;
    }

    this.currentLayout = null;
  }

  /**
   * Get current overlay statistics for debugging
   */
  getStats(): {
    visible: boolean;
    layout: LayoutResult | null;
    itemCount: number;
  } {
    return {
      visible: this.isVisible,
      layout: this.currentLayout,
      itemCount: this.itemBoxes.length,
    };
  }
} 