import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { PaneContext, EnhancedKeyBinding } from "../types/keybinding.js";

export interface OnboardingTooltipEntry {
  /** Unique identifier for the tooltip */
  id: string;
  /** Associated keybinding */
  bindingKey: string;
  /** Context where tooltip appears */
  context: PaneContext;
  /** Number of times shown */
  showCount: number;
  /** First time shown */
  firstShown: number;
  /** Last time shown */
  lastShown: number;
  /** Whether tooltip is considered "learned" (won't show again) */
  learned: boolean;
}

export interface OnboardingState {
  /** Version of the onboarding state format */
  version: string;
  /** Timestamp when state was first created */
  createdAt: number;
  /** Timestamp when state was last updated */
  updatedAt: number;
  /** Map of tooltip entries by ID */
  tooltips: Record<string, OnboardingTooltipEntry>;
  /** User preferences */
  preferences: {
    /** Whether onboarding is enabled globally */
    enabled: boolean;
    /** Maximum times to show each tooltip */
    maxShowCount: number;
    /** Minimum time between showing same tooltip (ms) */
    minRepeatDelay: number;
    /** Auto-mark as learned after this many shows */
    autoLearnThreshold: number;
  };
}

export interface OnboardingConfig {
  /** Path to store onboarding state file */
  configPath?: string;
  /** Whether to auto-save changes */
  autoSave?: boolean;
  /** Auto-save delay in milliseconds */
  autoSaveDelay?: number;
}

/**
 * OnboardingStateManager handles persistence and tracking of onboarding tooltips
 * Integrates with the keybinding discovery system to provide progressive disclosure
 */
export class OnboardingStateManager {
  private state: OnboardingState;
  private config: Required<OnboardingConfig>;
  private configPath: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isLoaded = false;

  // Default configuration
  private static readonly DEFAULT_CONFIG: Required<OnboardingConfig> = {
    configPath: "", // Will be set in constructor
    autoSave: true,
    autoSaveDelay: 1000, // 1 second
  };

  // Default state
  private static readonly DEFAULT_STATE: OnboardingState = {
    version: "1.0.0",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tooltips: {},
    preferences: {
      enabled: true,
      maxShowCount: 2, // Show each tooltip max 2 times
      minRepeatDelay: 24 * 60 * 60 * 1000, // 24 hours between repeats
      autoLearnThreshold: 2, // Mark as learned after 2 shows
    },
  };

  constructor(config?: OnboardingConfig) {
    // Set default config path to user's home directory
    const defaultConfigPath = join(homedir(), ".config", "astrotask", "onboarding.json");
    
    this.config = {
      ...OnboardingStateManager.DEFAULT_CONFIG,
      configPath: defaultConfigPath,
      ...config,
    };

    this.configPath = this.config.configPath;
    this.state = { ...OnboardingStateManager.DEFAULT_STATE };
  }

  /**
   * Initialize the onboarding state manager by loading from file
   */
  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      await this.loadState();
      this.isLoaded = true;
    } catch (error) {
      // If loading fails, use default state and save it
      console.warn("Failed to load onboarding state, using defaults:", error);
      this.state = { ...OnboardingStateManager.DEFAULT_STATE };
      this.isLoaded = true;
      
      if (this.config.autoSave) {
        await this.saveState();
      }
    }
  }

  /**
   * Check if a tooltip should be shown for a given binding
   */
  shouldShowTooltip(binding: EnhancedKeyBinding, context: PaneContext): boolean {
    if (!this.isLoaded || !this.state.preferences.enabled) {
      return false;
    }

    // Skip if binding doesn't support onboarding
    if (!binding.showInOnboarding) {
      return false;
    }

    const tooltipId = this.generateTooltipId(binding, context);
    const entry = this.state.tooltips[tooltipId];

    // First time - show it
    if (!entry) {
      return true;
    }

    // Already learned - don't show
    if (entry.learned) {
      return false;
    }

    // Reached max show count - don't show
    if (entry.showCount >= this.state.preferences.maxShowCount) {
      return false;
    }

    // Check minimum delay since last show
    const timeSinceLastShow = Date.now() - entry.lastShown;
    if (timeSinceLastShow < this.state.preferences.minRepeatDelay) {
      return false;
    }

    return true;
  }

  /**
   * Record that a tooltip was shown
   */
  async recordTooltipShown(binding: EnhancedKeyBinding, context: PaneContext): Promise<void> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    const tooltipId = this.generateTooltipId(binding, context);
    const now = Date.now();
    
    const existing = this.state.tooltips[tooltipId];
    
    if (existing) {
      // Update existing entry
      existing.showCount++;
      existing.lastShown = now;
      
      // Auto-learn if threshold reached
      if (existing.showCount >= this.state.preferences.autoLearnThreshold) {
        existing.learned = true;
      }
    } else {
      // Create new entry
      this.state.tooltips[tooltipId] = {
        id: tooltipId,
        bindingKey: binding.key,
        context,
        showCount: 1,
        firstShown: now,
        lastShown: now,
        learned: false,
      };
    }

    this.state.updatedAt = now;
    
    if (this.config.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Mark a tooltip as learned (won't show again)
   */
  async markAsLearned(binding: EnhancedKeyBinding, context: PaneContext): Promise<void> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    const tooltipId = this.generateTooltipId(binding, context);
    const entry = this.state.tooltips[tooltipId];
    
    if (entry) {
      entry.learned = true;
      entry.lastShown = Date.now();
      this.state.updatedAt = Date.now();
      
      if (this.config.autoSave) {
        this.scheduleSave();
      }
    }
  }

  /**
   * Reset onboarding state for a specific binding or all bindings
   */
  async resetOnboarding(binding?: EnhancedKeyBinding, context?: PaneContext): Promise<void> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    if (binding && context) {
      // Reset specific tooltip
      const tooltipId = this.generateTooltipId(binding, context);
      delete this.state.tooltips[tooltipId];
    } else {
      // Reset all tooltips
      this.state.tooltips = {};
    }

    this.state.updatedAt = Date.now();
    
    if (this.config.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Get onboarding statistics
   */
  getStats(): {
    totalTooltips: number;
    shownTooltips: number;
    learnedTooltips: number;
    averageShowCount: number;
  } {
    const entries = Object.values(this.state.tooltips);
    const totalTooltips = entries.length;
    const shownTooltips = entries.filter(e => e.showCount > 0).length;
    const learnedTooltips = entries.filter(e => e.learned).length;
    const totalShows = entries.reduce((sum, e) => sum + e.showCount, 0);
    const averageShowCount = totalTooltips > 0 ? totalShows / totalTooltips : 0;

    return {
      totalTooltips,
      shownTooltips,
      learnedTooltips,
      averageShowCount,
    };
  }

  /**
   * Update preferences
   */
  async updatePreferences(updates: Partial<OnboardingState["preferences"]>): Promise<void> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    this.state.preferences = { ...this.state.preferences, ...updates };
    this.state.updatedAt = Date.now();
    
    if (this.config.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Get current preferences
   */
  getPreferences(): OnboardingState["preferences"] {
    return { ...this.state.preferences };
  }

  /**
   * Check if onboarding is enabled
   */
  isEnabled(): boolean {
    return this.isLoaded && this.state.preferences.enabled;
  }

  /**
   * Save state immediately
   */
  async saveState(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(dirname(this.configPath), { recursive: true });
      
      // Write state to file with pretty formatting
      const json = JSON.stringify(this.state, null, 2);
      await fs.writeFile(this.configPath, json, "utf-8");
      
      if (process.env["DEBUG_ONBOARDING"]) {
        console.error(`DEBUG: Onboarding state saved to ${this.configPath}`);
      }
    } catch (error) {
      console.error("Failed to save onboarding state:", error);
    }
  }

  /**
   * Load state from file
   */
  private async loadState(): Promise<void> {
    try {
      const json = await fs.readFile(this.configPath, "utf-8");
      const loaded = JSON.parse(json) as OnboardingState;
      
      // Validate and merge with defaults
      this.state = {
        ...OnboardingStateManager.DEFAULT_STATE,
        ...loaded,
        preferences: {
          ...OnboardingStateManager.DEFAULT_STATE.preferences,
          ...loaded.preferences,
        },
      };
      
      if (process.env["DEBUG_ONBOARDING"]) {
        console.error(`DEBUG: Onboarding state loaded from ${this.configPath}`);
      }
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        // File doesn't exist, use defaults
        this.state = { ...OnboardingStateManager.DEFAULT_STATE };
      } else {
        throw error;
      }
    }
  }

  /**
   * Schedule auto-save with debouncing
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(() => {
      this.saveState().catch(error => {
        console.error("Auto-save failed:", error);
      });
    }, this.config.autoSaveDelay);
  }

  /**
   * Generate unique ID for a tooltip
   */
  private generateTooltipId(binding: EnhancedKeyBinding, context: PaneContext): string {
    return `${context}-${binding.key}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
  }
} 