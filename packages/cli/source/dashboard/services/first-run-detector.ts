import type { ContextTracker, ContextEvent } from "./context-tracker.js";
import type { OnboardingStateManager } from "./onboarding-state.js";
import type { EnhancedKeymapService } from "./enhanced-keymap.js";
import type { PaneContext, EnhancedKeyBinding } from "../types/keybinding.js";

export interface PaneVisitEntry {
  /** Pane context */
  context: PaneContext;
  /** Number of times visited */
  visitCount: number;
  /** Timestamp of first visit */
  firstVisit: number;
  /** Timestamp of last visit */
  lastVisit: number;
  /** Whether onboarding tooltips are active for this pane */
  onboardingActive: boolean;
}

export interface TooltipTriggerEvent {
  /** The keybinding to show tooltip for */
  binding: EnhancedKeyBinding;
  /** Context where tooltip should appear */
  context: PaneContext;
  /** Visit count that triggered this tooltip */
  visitCount: number;
  /** Whether this is a first-time or repeat trigger */
  isFirstTime: boolean;
}

export interface FirstRunConfig {
  /** Maximum visit count to show tooltips */
  maxTooltipVisits: number;
  /** Minimum time between tooltip triggers (ms) */
  minTooltipDelay: number;
  /** Whether to show tooltips on focus change or with delay */
  showOnFocusChange: boolean;
  /** Delay before showing tooltips on focus (ms) */
  focusDelay: number;
  /** Maximum number of tooltips to show per visit */
  maxTooltipsPerVisit: number;
}

/**
 * FirstRunDetector tracks pane visits and triggers onboarding tooltips
 * for new users on their first and second visits to each pane
 */
export class FirstRunDetector {
  private contextTracker: ContextTracker;
  private onboardingState: OnboardingStateManager;
  private keymapService: EnhancedKeymapService;
  private config: FirstRunConfig;
  
  private visits: Map<PaneContext, PaneVisitEntry> = new Map();
  private listeners: Array<(event: TooltipTriggerEvent) => void> = [];
  private tooltipTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  // Default configuration
  private static readonly DEFAULT_CONFIG: FirstRunConfig = {
    maxTooltipVisits: 2, // Show tooltips for first 2 visits
    minTooltipDelay: 3000, // 3 seconds between tooltips
    showOnFocusChange: true, // Show immediately on focus change
    focusDelay: 1000, // 1 second delay after focus
    maxTooltipsPerVisit: 3, // Max 3 tooltips per pane visit
  };

  constructor(
    contextTracker: ContextTracker,
    onboardingState: OnboardingStateManager,
    keymapService: EnhancedKeymapService,
    config?: Partial<FirstRunConfig>
  ) {
    this.contextTracker = contextTracker;
    this.onboardingState = onboardingState;
    this.keymapService = keymapService;
    this.config = { ...FirstRunDetector.DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the first-run detector
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Ensure onboarding state is loaded
    await this.onboardingState.initialize();

    // Initialize visit tracking for all contexts
    const contexts: PaneContext[] = ["task_tree", "project_list", "task_detail"];
    for (const context of contexts) {
      this.visits.set(context, {
        context,
        visitCount: 0,
        firstVisit: 0,
        lastVisit: 0,
        onboardingActive: true,
      });
    }

    // Set up context tracking
    this.contextTracker.addEventListener(this.handleContextEvent.bind(this));

    // Record initial context as a visit
    const currentContext = this.contextTracker.getCurrentContext();
    this.recordPaneVisit(currentContext);

    this.isInitialized = true;
  }

  /**
   * Handle context events from the context tracker
   */
  private handleContextEvent(event: ContextEvent): void {
    if (event.type === "navigation") {
      this.recordPaneVisit(event.context);
      
      if (this.config.showOnFocusChange) {
        this.scheduleTooltipCheck(event.context);
      }
    }
  }

  /**
   * Record a visit to a pane
   */
  private recordPaneVisit(context: PaneContext): void {
    const now = Date.now();
    const existing = this.visits.get(context);
    
    if (existing) {
      existing.visitCount++;
      existing.lastVisit = now;
      
      // Disable onboarding if user has visited too many times
      if (existing.visitCount > this.config.maxTooltipVisits) {
        existing.onboardingActive = false;
      }
    } else {
      this.visits.set(context, {
        context,
        visitCount: 1,
        firstVisit: now,
        lastVisit: now,
        onboardingActive: true,
      });
    }

    if (process.env["DEBUG_ONBOARDING"]) {
      const visit = this.visits.get(context)!;
      console.error(`DEBUG: Recorded visit to ${context} (count: ${visit.visitCount})`);
    }
  }

  /**
   * Schedule tooltip check with delay
   */
  private scheduleTooltipCheck(context: PaneContext): void {
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer);
    }

    this.tooltipTimer = setTimeout(() => {
      this.checkAndTriggerTooltips(context);
    }, this.config.focusDelay);
  }

  /**
   * Check if tooltips should be shown and trigger them
   */
  private async checkAndTriggerTooltips(context: PaneContext): Promise<void> {
    if (!this.onboardingState.isEnabled()) {
      return;
    }

    const visit = this.visits.get(context);
    if (!visit || !visit.onboardingActive) {
      return;
    }

    // Only show tooltips for first few visits
    if (visit.visitCount > this.config.maxTooltipVisits) {
      return;
    }

    // Get relevant keybindings for this context
    const candidateBindings = this.getTooltipCandidates(context);
    
    // Filter bindings that should show tooltips
    const tooltipBindings: EnhancedKeyBinding[] = [];
    for (const binding of candidateBindings) {
      if (await this.shouldShowTooltip(binding, context)) {
        tooltipBindings.push(binding);
        
        // Limit number of tooltips per visit
        if (tooltipBindings.length >= this.config.maxTooltipsPerVisit) {
          break;
        }
      }
    }

    // Trigger tooltips
    for (const binding of tooltipBindings) {
      const isFirstTime = !(await this.hasSeenTooltip(binding, context));
      
      const event: TooltipTriggerEvent = {
        binding,
        context,
        visitCount: visit.visitCount,
        isFirstTime,
      };

      // Notify listeners
      this.notifyListeners(event);

      // Record that tooltip was shown
      await this.onboardingState.recordTooltipShown(binding, context);

      if (process.env["DEBUG_ONBOARDING"]) {
        console.error(`DEBUG: Triggered tooltip for ${binding.key} in ${context} (visit: ${visit.visitCount})`);
      }
    }
  }

  /**
   * Get candidate keybindings for tooltips in a context
   */
  private getTooltipCandidates(context: PaneContext): EnhancedKeyBinding[] {
    const registry = this.keymapService.getRegistry();
    
    // Get bindings for current context
    const contextBindings = registry.getByContext(context);
    
    // Filter to only onboarding-eligible bindings
    const candidates = contextBindings
      .filter(entry => entry.active && entry.binding.showInOnboarding)
      .map(entry => entry.binding)
      .sort((a, b) => {
        // Sort by priority and weight
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority || "medium"];
        const bPriority = priorityOrder[b.priority || "medium"];
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first
        }
        
        return (b.weight || 0) - (a.weight || 0); // Higher weight first
      });

    return candidates;
  }

  /**
   * Check if a tooltip should be shown for a binding
   */
  private async shouldShowTooltip(binding: EnhancedKeyBinding, context: PaneContext): Promise<boolean> {
    // Check with onboarding state manager
    if (!this.onboardingState.shouldShowTooltip(binding, context)) {
      return false;
    }

    // Check if binding condition is met
    if (binding.condition && !binding.condition()) {
      return false;
    }

    // Additional first-run specific checks
    const visit = this.visits.get(context);
    if (!visit || visit.visitCount > this.config.maxTooltipVisits) {
      return false;
    }

    return true;
  }

  /**
   * Check if user has seen a tooltip before
   */
  private async hasSeenTooltip(binding: EnhancedKeyBinding, context: PaneContext): Promise<boolean> {
    // This information is tracked by the onboarding state manager
    return !this.onboardingState.shouldShowTooltip(binding, context);
  }

  /**
   * Get current visit information
   */
  getVisitInfo(context?: PaneContext): PaneVisitEntry | Map<PaneContext, PaneVisitEntry> {
    if (context) {
      return this.visits.get(context) || {
        context,
        visitCount: 0,
        firstVisit: 0,
        lastVisit: 0,
        onboardingActive: false,
      };
    }
    return new Map(this.visits);
  }

  /**
   * Check if a pane is eligible for onboarding tooltips
   */
  isPaneEligibleForOnboarding(context: PaneContext): boolean {
    const visit = this.visits.get(context);
    return visit ? visit.onboardingActive && visit.visitCount <= this.config.maxTooltipVisits : true;
  }

  /**
   * Manually trigger tooltip check for current context
   */
  async triggerTooltipCheck(): Promise<void> {
    const currentContext = this.contextTracker.getCurrentContext();
    await this.checkAndTriggerTooltips(currentContext);
  }

  /**
   * Reset visit tracking for a context or all contexts
   */
  resetVisitTracking(context?: PaneContext): void {
    if (context) {
      this.visits.delete(context);
    } else {
      this.visits.clear();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FirstRunConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FirstRunConfig {
    return { ...this.config };
  }

  /**
   * Add event listener for tooltip triggers
   */
  addEventListener(listener: (event: TooltipTriggerEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: TooltipTriggerEvent) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of a tooltip trigger event
   */
  private notifyListeners(event: TooltipTriggerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Error in tooltip trigger listener:", error);
      }
    }
  }

  /**
   * Get statistics about first-run detection
   */
  getStats(): {
    totalVisits: number;
    activeOnboardingPanes: number;
    visitsByPane: Record<PaneContext, number>;
  } {
    const visits = Array.from(this.visits.values());
    const totalVisits = visits.reduce((sum, v) => sum + v.visitCount, 0);
    const activeOnboardingPanes = visits.filter(v => v.onboardingActive).length;
    
    const visitsByPane: Record<PaneContext, number> = {} as any;
    for (const visit of visits) {
      visitsByPane[visit.context] = visit.visitCount;
    }

    return {
      totalVisits,
      activeOnboardingPanes,
      visitsByPane,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }
    
    this.listeners = [];
    this.visits.clear();
  }
} 