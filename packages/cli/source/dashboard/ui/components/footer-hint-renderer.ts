import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";
import type { HintScorer } from "../../services/hint-scorer.js";
import type { ContextTracker } from "../../services/context-tracker.js";
import type { FooterHint } from "../../types/keybinding.js";

export interface FooterHintConfig {
  /** Enable/disable footer hints */
  enabled: boolean;
  
  /** Show hints after idle time (ms) */
  idleDelay: number;
  
  /** Fade animation duration (ms) */
  fadeInDuration: number;
  
  /** Fade out duration (ms) */
  fadeOutDuration: number;
  
  /** Maximum hint display time (ms) before auto-hide */
  maxDisplayTime: number;
  
  /** Show hints immediately on context change */
  showOnContextChange: boolean;
}

/**
 * FooterHintRenderer manages the display of contextual footer hints
 * integrated with the existing Legend component
 */
export class FooterHintRenderer {
  private hintScorer: HintScorer;
  private contextTracker: ContextTracker;
  private config: FooterHintConfig;
  private currentHints: FooterHint[] = [];
  private isVisible: boolean = false;
  private fadeTimeout: NodeJS.Timeout | null = null;
  private hideTimeout: NodeJS.Timeout | null = null;
  private unsubscribe: () => void = () => {};
  private onStateChange?: () => void; // Callback for when hint state changes

  // Default configuration
  private static readonly DEFAULT_CONFIG: FooterHintConfig = {
    enabled: true,
    idleDelay: 0, // Show immediately
    fadeInDuration: 300,
    fadeOutDuration: 200,
    maxDisplayTime: 10000, // 10 seconds
    showOnContextChange: true, // Show hints immediately on context change
  };

  constructor(
    hintScorer: HintScorer,
    contextTracker: ContextTracker,
    store: StoreApi<DashboardStore>,
    config?: Partial<FooterHintConfig>,
    onStateChange?: () => void
  ) {
    this.hintScorer = hintScorer;
    this.contextTracker = contextTracker;
    this.config = { ...FooterHintRenderer.DEFAULT_CONFIG, ...config };
    this.onStateChange = onStateChange;

    this.setupEventListeners(store);
  }

  /**
   * Set up event listeners for context changes and idle detection
   */
  private setupEventListeners(store: StoreApi<DashboardStore>): void {
    // Listen for context changes from the context tracker
    this.contextTracker.addEventListener((event) => {
      if (event.type === "idle" && this.config.enabled) {
        this.scheduleHintDisplay();
      } else if (event.type === "navigation") {
        if (this.config.showOnContextChange && this.config.enabled) {
          this.scheduleHintDisplay();
        } else {
          this.hideHints();
        }
      } else if (event.type === "action") {
        // Hide hints when user takes action
        this.hideHints();
      }
    });

    // Subscribe to store changes for reactive updates
    this.unsubscribe = store.subscribe((state) => {
      // Update hints when certain states change
      if (state.commandPaletteOpen || state.helpOverlayOpen || state.editorActive) {
        this.hideHints();
      }
    });
  }

  /**
   * Schedule hint display after idle delay
   */
  private scheduleHintDisplay(): void {
    this.clearTimers();

    this.fadeTimeout = setTimeout(() => {
      this.showHints();
    }, this.config.idleDelay);
  }

  /**
   * Show footer hints with fade-in animation
   */
  private showHints(): void {
    if (!this.config.enabled || this.isVisible) return;

    // Get current hints from scorer
    this.currentHints = this.hintScorer.getFooterHints();

    if (this.currentHints.length === 0) return;

    this.isVisible = true;

    // Simulate fade-in by updating content gradually
    // (blessed doesn't have native animations, so we'll do a simple show)
    this.updateDisplay();

    // Auto-hide after max display time
    this.hideTimeout = setTimeout(() => {
      this.hideHints();
    }, this.config.maxDisplayTime);
  }

  /**
   * Hide footer hints with fade-out animation
   */
  private hideHints(): void {
    if (!this.isVisible) return;

    this.clearTimers();
    this.isVisible = false;
    this.currentHints = [];
    this.updateDisplay();
  }

  /**
   * Clear all active timers
   */
  private clearTimers(): void {
    if (this.fadeTimeout) {
      clearTimeout(this.fadeTimeout);
      this.fadeTimeout = null;
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  /**
   * Update the display - this should trigger a re-render of the Legend
   */
  private updateDisplay(): void {
    // The Legend component will call getHintContent() to get the current content
    // We just need to trigger a re-render somehow
    // For now, we'll rely on the store subscription and external render calls
    if (this.onStateChange) {
      this.onStateChange();
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<FooterHintConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (!this.config.enabled) {
      this.hideHints();
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): FooterHintConfig {
    return { ...this.config };
  }

  /**
   * Get analytics data about hint usage
   */
  public getAnalytics(): {
    hintsShown: number;
    averageDisplayTime: number;
    mostShownHints: Array<{ binding: string; count: number }>;
  } {
    // TODO: Implement analytics tracking
    return {
      hintsShown: 0,
      averageDisplayTime: 0,
      mostShownHints: [],
    };
  }

  /**
   * Force show hints (useful for testing)
   */
  public forceShow(): void {
    this.showHints();
  }

  /**
   * Force hide hints
   */
  public forceHide(): void {
    this.hideHints();
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.clearTimers();
    this.unsubscribe();
  }

  /**
   * Update the display with current hints
   * This method should be called by the Legend component to get hint content
   */
  public getHintContent(): string {
    if (!this.config.enabled) {
      return "";
    }

    // Always fetch fresh hints for current context
    const hints = this.hintScorer.getFooterHints();
    
    if (hints.length === 0) {
      return "";
    }

    const hintTexts = hints.map((hint) => {
      return `{bold}{cyan-fg}${hint.keyText}{/cyan-fg}{/bold} ${hint.displayText}`
    });

    const result = `{gray-fg}Next actions:{/gray-fg} ${hintTexts.join(" │ ")}`;
    return result;
  }

  /**
   * Check if hints are currently visible
   */
  public isHintsVisible(): boolean {
    return true; // Hints are always considered visible now
  }
}