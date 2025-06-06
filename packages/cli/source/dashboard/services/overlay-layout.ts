import type { EnhancedKeyBinding } from "../types/keybinding.js";

export interface OverlayDimensions {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface LayoutPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KeyRingItem {
  binding: EnhancedKeyBinding;
  position: LayoutPosition;
  displayText: string;
  keyText: string;
}

export type LayoutMode = "radial" | "stacked";

export interface LayoutConfig {
  /** Minimum space required for radial layout */
  minRadialWidth: number;
  minRadialHeight: number;
  /** Padding around the overlay */
  padding: number;
  /** Radius for radial layout */
  radialRadius: number;
  /** Item dimensions */
  itemWidth: number;
  itemHeight: number;
  /** Spacing between items in stacked mode */
  stackSpacing: number;
}

export interface LayoutResult {
  mode: LayoutMode;
  items: KeyRingItem[];
  overlay: OverlayDimensions;
  totalItems: number;
}

/**
 * Layout engine for the key ring overlay that provides responsive layouts
 * based on available terminal space and number of keybindings to display.
 */
export class OverlayLayoutEngine {
  private config: LayoutConfig = {
    minRadialWidth: 40,
    minRadialHeight: 20,
    padding: 2,
    radialRadius: 8,
    itemWidth: 12,
    itemHeight: 1,
    stackSpacing: 1,
  };

  constructor(config?: Partial<LayoutConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Calculate the optimal layout for given bindings and terminal dimensions
   */
  calculateLayout(
    bindings: EnhancedKeyBinding[],
    terminalWidth: number,
    terminalHeight: number
  ): LayoutResult {
    // Filter and prepare bindings
    const items = this.prepareItems(bindings);
    
    // Determine available space for overlay
    const availableWidth = terminalWidth - (this.config.padding * 2);
    const availableHeight = terminalHeight - (this.config.padding * 2);
    
    // Choose layout mode based on space and item count
    const mode = this.selectLayoutMode(items.length, availableWidth, availableHeight);
    
    // Calculate overlay dimensions
    const overlay = this.calculateOverlayDimensions(
      mode,
      items.length,
      terminalWidth,
      terminalHeight
    );
    
    // Position items according to selected mode
    const positionedItems = mode === "radial" 
      ? this.calculateRadialLayout(items, overlay)
      : this.calculateStackedLayout(items, overlay);
    
    return {
      mode,
      items: positionedItems,
      overlay,
      totalItems: items.length,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LayoutConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): LayoutConfig {
    return { ...this.config };
  }

  private prepareItems(bindings: EnhancedKeyBinding[]): Array<{
    binding: EnhancedKeyBinding;
    displayText: string;
    keyText: string;
  }> {
    return bindings.map(binding => ({
      binding,
      displayText: this.formatDisplayText(binding),
      keyText: this.formatKeyText(binding),
    }));
  }

  private formatDisplayText(binding: EnhancedKeyBinding): string {
    // Use hint if available, otherwise truncate description
    const text = binding.hint || binding.description;
    const maxLength = this.config.itemWidth - 2; // Account for padding
    return text.length > maxLength ? text.substring(0, maxLength - 1) + "…" : text;
  }

  private formatKeyText(binding: EnhancedKeyBinding): string {
    // Format the key for display (e.g., "Ctrl+K" instead of "c-k")
    let key = binding.key;
    
    // Handle common key formatting
    key = key.replace(/^c-/, "Ctrl+");
    key = key.replace(/^s-/, "Shift+");
    key = key.replace(/^m-/, "Alt+");
    
    // Capitalize single letters
    if (key.length === 1) {
      key = key.toUpperCase();
    }
    
    return key;
  }

  private selectLayoutMode(
    itemCount: number,
    availableWidth: number,
    availableHeight: number
  ): LayoutMode {
    // Check if we have enough space for radial layout
    const hasRadialSpace = 
      availableWidth >= this.config.minRadialWidth &&
      availableHeight >= this.config.minRadialHeight;
    
    // Check if radial layout makes sense for the number of items
    const radialSuitable = itemCount <= 12 && itemCount >= 3;
    
    return hasRadialSpace && radialSuitable ? "radial" : "stacked";
  }

  private calculateOverlayDimensions(
    mode: LayoutMode,
    itemCount: number,
    terminalWidth: number,
    terminalHeight: number
  ): OverlayDimensions {
    if (mode === "radial") {
      // Radial layout uses a circular area
      const diameter = this.config.radialRadius * 2 + this.config.itemWidth;
      const width = Math.min(diameter + this.config.padding * 2, terminalWidth);
      const height = Math.min(diameter + this.config.padding * 2, terminalHeight);
      
      return {
        width,
        height,
        centerX: Math.floor(terminalWidth / 2),
        centerY: Math.floor(terminalHeight / 2),
      };
    } else {
      // Stacked layout uses a vertical list
      const maxItemsPerColumn = Math.floor(
        (terminalHeight - this.config.padding * 2) / 
        (this.config.itemHeight + this.config.stackSpacing)
      );
      
      const columns = Math.ceil(itemCount / maxItemsPerColumn);
      const width = Math.min(
        columns * (this.config.itemWidth + this.config.stackSpacing) + this.config.padding * 2,
        terminalWidth
      );
      
      const height = Math.min(
        Math.min(itemCount, maxItemsPerColumn) * 
        (this.config.itemHeight + this.config.stackSpacing) + this.config.padding * 2,
        terminalHeight
      );
      
      return {
        width,
        height,
        centerX: Math.floor(terminalWidth / 2),
        centerY: Math.floor(terminalHeight / 2),
      };
    }
  }

  private calculateRadialLayout(
    items: Array<{ binding: EnhancedKeyBinding; displayText: string; keyText: string }>,
    overlay: OverlayDimensions
  ): KeyRingItem[] {
    const angleStep = (2 * Math.PI) / items.length;
    const radius = this.config.radialRadius;
    
    return items.map((item, index) => {
      const angle = index * angleStep - Math.PI / 2; // Start at top
      const x = Math.round(overlay.centerX + radius * Math.cos(angle) - this.config.itemWidth / 2);
      const y = Math.round(overlay.centerY + radius * Math.sin(angle));
      
      return {
        ...item,
        position: {
          x: Math.max(0, Math.min(x, overlay.width - this.config.itemWidth)),
          y: Math.max(0, Math.min(y, overlay.height - this.config.itemHeight)),
          width: this.config.itemWidth,
          height: this.config.itemHeight,
        },
      };
    });
  }

  private calculateStackedLayout(
    items: Array<{ binding: EnhancedKeyBinding; displayText: string; keyText: string }>,
    overlay: OverlayDimensions
  ): KeyRingItem[] {
    const maxItemsPerColumn = Math.floor(
      (overlay.height - this.config.padding * 2) / 
      (this.config.itemHeight + this.config.stackSpacing)
    );
    
    const startX = overlay.centerX - overlay.width / 2 + this.config.padding;
    const startY = overlay.centerY - overlay.height / 2 + this.config.padding;
    
    return items.map((item, index) => {
      const column = Math.floor(index / maxItemsPerColumn);
      const row = index % maxItemsPerColumn;
      
      const x = startX + column * (this.config.itemWidth + this.config.stackSpacing);
      const y = startY + row * (this.config.itemHeight + this.config.stackSpacing);
      
      return {
        ...item,
        position: {
          x: Math.round(x),
          y: Math.round(y),
          width: this.config.itemWidth,
          height: this.config.itemHeight,
        },
      };
    });
  }

  /**
   * Get layout statistics for debugging/optimization
   */
  getLayoutStats(result: LayoutResult): {
    efficiency: number;
    density: number;
    mode: LayoutMode;
    itemCount: number;
  } {
    const totalArea = result.overlay.width * result.overlay.height;
    const usedArea = result.items.length * (this.config.itemWidth * this.config.itemHeight);
    
    return {
      efficiency: usedArea / totalArea,
      density: result.items.length / totalArea,
      mode: result.mode,
      itemCount: result.items.length,
    };
  }
} 