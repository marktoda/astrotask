import { EventEmitter } from "events";
import type {
  EnhancedKeyBinding,
  PaneContext,
  KeyBindingRegistryEntry,
  KeyBindingUsageStats,
  KeyBindingQuery,
  DiscoveryStatus,
  DiscoveryEvents,
  DiscoveryConfig,
} from "../types/keybinding.js";

/**
 * Central KeyMap Registry for the Astrolabe TUI Keybinding Discovery System
 * 
 * This class serves as the single source of truth for all keybindings across
 * the dashboard, providing enhanced capabilities for discovery, tracking, and
 * progressive disclosure while maintaining backward compatibility with the 
 * existing KeymapService.
 */
export class KeyMapRegistry extends EventEmitter {
  private entries: Map<string, KeyBindingRegistryEntry> = new Map();
  private contextIndex: Map<PaneContext, Set<string>> = new Map();
  private categoryIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private usageStats: Map<string, KeyBindingUsageStats> = new Map();
  private config: DiscoveryConfig;

  constructor(config?: Partial<DiscoveryConfig>) {
    super();
    
    // Default configuration
    this.config = {
      footerHints: true,
      keyringTrigger: "ctrl-k",
      onboarding: true,
      hintIdleTime: 2000, // 2 seconds
      triggerHoldTime: 250, // 250ms
      maxFooterHints: 2,
      unknownKeyToasts: true,
      ...config,
    };

    // Initialize context index
    this.initializeContextIndex();
  }

  /**
   * Initialize the context index with all supported pane contexts
   */
  private initializeContextIndex(): void {
    const contexts: PaneContext[] = [
      "task_tree",
      "project_list", 
      "global",
      "command_palette",
      "help_overlay",
      "task_detail",
      "search",
      "settings"
    ];

    for (const context of contexts) {
      this.contextIndex.set(context, new Set());
    }
  }

  /**
   * Register a new keybinding in the registry
   */
  public register(binding: EnhancedKeyBinding): string {
    const id = this.generateBindingId(binding);
    
    // Check for conflicts
    if (this.hasKeyConflict(binding.key, binding.context, id)) {
      throw new Error(`Key conflict: "${binding.key}" is already bound in context "${binding.context}"`);
    }

    // Create registry entry
    const entry: KeyBindingRegistryEntry = {
      id,
      binding,
      stats: this.createInitialStats(id, binding.context),
      active: true,
      registered: Date.now(),
    };

    // Store the entry
    this.entries.set(id, entry);

    // Update indexes
    this.updateIndexes(id, binding);

    // Initialize usage stats
    this.usageStats.set(id, entry.stats);

    return id;
  }

  /**
   * Generate a unique ID for a keybinding
   */
  private generateBindingId(binding: EnhancedKeyBinding): string {
    const contextPart = binding.context.replace(/_/g, '');
    const keyPart = binding.key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const timestamp = Date.now().toString(36);
    return `${contextPart}-${keyPart}-${timestamp}`;
  }

  /**
   * Check if a key combination would create a conflict
   */
  private hasKeyConflict(key: string, context: PaneContext, excludeId?: string): boolean {
    const contextBindings = this.contextIndex.get(context);
    if (!contextBindings) return false;

    for (const bindingId of contextBindings) {
      if (bindingId === excludeId) continue;
      
      const entry = this.entries.get(bindingId);
      if (!entry || !entry.active) continue;

      // Check main key
      if (entry.binding.key === key) return true;
      
      // Check aliases
      if (entry.binding.aliases?.includes(key)) return true;
    }

    return false;
  }

  /**
   * Create initial usage statistics for a new binding
   */
  private createInitialStats(bindingId: string, context: PaneContext): KeyBindingUsageStats {
    return {
      bindingId,
      usageCount: 0,
      lastUsed: 0,
      discoveryStatus: "new" as DiscoveryStatus,
      discoveryContext: context,
    };
  }

  /**
   * Update all indexes when a binding is added
   */
  private updateIndexes(id: string, binding: EnhancedKeyBinding): void {
    // Context index
    const contextSet = this.contextIndex.get(binding.context);
    contextSet?.add(id);

    // Category index
    if (binding.category) {
      if (!this.categoryIndex.has(binding.category)) {
        this.categoryIndex.set(binding.category, new Set());
      }
      this.categoryIndex.get(binding.category)?.add(id);
    }

    // Tag index
    if (binding.tags) {
      for (const tag of binding.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)?.add(id);
      }
    }
  }

  /**
   * Unregister a keybinding from the registry
   */
  public unregister(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    // Remove from indexes
    this.removeFromIndexes(id, entry.binding);

    // Remove from main storage
    this.entries.delete(id);
    this.usageStats.delete(id);

    return true;
  }

  /**
   * Remove a binding from all indexes
   */
  private removeFromIndexes(id: string, binding: EnhancedKeyBinding): void {
    // Context index
    this.contextIndex.get(binding.context)?.delete(id);

    // Category index
    if (binding.category) {
      this.categoryIndex.get(binding.category)?.delete(id);
    }

    // Tag index
    if (binding.tags) {
      for (const tag of binding.tags) {
        this.tagIndex.get(tag)?.delete(id);
      }
    }
  }

  /**
   * Get a keybinding by its ID
   */
  public get(id: string): KeyBindingRegistryEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Query keybindings based on various criteria
   */
  public query(options: KeyBindingQuery = {}): KeyBindingRegistryEntry[] {
    let results: KeyBindingRegistryEntry[] = [];

    // Start with all entries or filter by context
    if (options.context) {
      const contextBindings = this.contextIndex.get(options.context);
      if (contextBindings) {
        results = Array.from(contextBindings)
          .map(id => this.entries.get(id))
          .filter((entry): entry is KeyBindingRegistryEntry => entry !== undefined);
      }
    } else {
      results = Array.from(this.entries.values());
    }

    // Filter by active status
    if (options.activeOnly) {
      results = results.filter(entry => entry.active);
    }

    // Filter by category
    if (options.category) {
      results = results.filter(entry => entry.binding.category === options.category);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter(entry => 
        entry.binding.tags?.some(tag => options.tags!.includes(tag))
      );
    }

    // Filter by priority
    if (options.priority) {
      results = results.filter(entry => entry.binding.priority === options.priority);
    }

    // Sort by usage if requested
    if (options.sortByUsage) {
      results.sort((a, b) => {
        const statsA = this.usageStats.get(a.id);
        const statsB = this.usageStats.get(b.id);
        return (statsB?.usageCount || 0) - (statsA?.usageCount || 0);
      });
    }

    // Limit results
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get all keybindings for a specific context
   */
  public getByContext(context: PaneContext): KeyBindingRegistryEntry[] {
    return this.query({ context, activeOnly: true });
  }

  /**
   * Get keybindings for footer hints with scoring
   */
  public getFooterHints(context: PaneContext): KeyBindingRegistryEntry[] {
    const candidates = this.getByContext(context);
    
    // Filter to only bindings suitable for footer hints
    const hintCandidates = candidates.filter(entry => {
      const binding = entry.binding;
      
      // Check if condition is met (if provided)
      if (binding.condition && !binding.condition()) {
        return false;
      }

      // Prefer bindings with higher weights
      return (binding.weight || 0) > 0;
    });

    // Sort by weight and recent usage
    hintCandidates.sort((a, b) => {
      const weightA = a.binding.weight || 0;
      const weightB = b.binding.weight || 0;
      
      const statsA = this.usageStats.get(a.id);
      const statsB = this.usageStats.get(b.id);
      
      const recencyA = statsA?.lastUsed || 0;
      const recencyB = statsB?.lastUsed || 0;
      
      // Primary sort by weight
      if (weightA !== weightB) {
        return weightB - weightA;
      }
      
      // Secondary sort by recency
      return recencyB - recencyA;
    });

    return hintCandidates.slice(0, this.config.maxFooterHints);
  }

  /**
   * Record usage of a keybinding
   */
  public recordUsage(id: string): void {
    const entry = this.entries.get(id);
    const stats = this.usageStats.get(id);
    
    if (!entry || !stats) return;

    // Update usage statistics
    stats.usageCount++;
    stats.lastUsed = Date.now();

    // Update discovery status
    if (stats.discoveryStatus === "new") {
      stats.discoveryStatus = "seen";
      if (!stats.timeToFirstUse) {
        stats.timeToFirstUse = Date.now() - entry.registered;
      }
    } else if (stats.discoveryStatus === "seen" && stats.usageCount >= 3) {
      stats.discoveryStatus = "learned";
    }

    // Emit usage event
    this.emit("bindingUsed", {
      bindingId: id,
      context: entry.binding.context,
      timestamp: Date.now(),
    } as DiscoveryEvents["bindingUsed"]);
  }

  /**
   * Find keybinding by key and context
   */
  public findByKey(key: string, context: PaneContext): KeyBindingRegistryEntry | undefined {
    const contextBindings = this.contextIndex.get(context);
    if (!contextBindings) return undefined;

    for (const bindingId of contextBindings) {
      const entry = this.entries.get(bindingId);
      if (!entry || !entry.active) continue;

      // Check main key
      if (entry.binding.key === key) return entry;
      
      // Check aliases
      if (entry.binding.aliases?.includes(key)) return entry;
    }

    return undefined;
  }

  /**
   * Get all categories with their binding counts
   */
  public getCategories(): Map<string, number> {
    const categoryStats = new Map<string, number>();
    
    for (const [category, bindingIds] of this.categoryIndex) {
      const activeCount = Array.from(bindingIds)
        .map(id => this.entries.get(id))
        .filter(entry => entry?.active).length;
      
      if (activeCount > 0) {
        categoryStats.set(category, activeCount);
      }
    }

    return categoryStats;
  }

  /**
   * Get all tags with their binding counts
   */
  public getTags(): Map<string, number> {
    const tagStats = new Map<string, number>();
    
    for (const [tag, bindingIds] of this.tagIndex) {
      const activeCount = Array.from(bindingIds)
        .map(id => this.entries.get(id))
        .filter(entry => entry?.active).length;
      
      if (activeCount > 0) {
        tagStats.set(tag, activeCount);
      }
    }

    return tagStats;
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<DiscoveryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): DiscoveryConfig {
    return { ...this.config };
  }

  /**
   * Get usage statistics for all bindings
   */
  public getUsageStats(): Map<string, KeyBindingUsageStats> {
    return new Map(this.usageStats);
  }

  /**
   * Export registry data for persistence
   */
  public export(): {
    entries: KeyBindingRegistryEntry[];
    stats: KeyBindingUsageStats[];
    config: DiscoveryConfig;
  } {
    return {
      entries: Array.from(this.entries.values()),
      stats: Array.from(this.usageStats.values()),
      config: this.config,
    };
  }

  /**
   * Get metrics for success tracking
   */
  public getMetrics(): {
    totalBindings: number;
    activeBindings: number;
    newBindings: number;
    seenBindings: number;
    learnedBindings: number;
    averageTimeToFirstUse: number;
    topUsedBindings: Array<{ id: string; usage: number; description: string }>;
  } {
    const entries = Array.from(this.entries.values());
    const stats = Array.from(this.usageStats.values());

    const activeEntries = entries.filter(e => e.active);
    const newCount = stats.filter(s => s.discoveryStatus === "new").length;
    const seenCount = stats.filter(s => s.discoveryStatus === "seen").length;
    const learnedCount = stats.filter(s => s.discoveryStatus === "learned").length;

    const timeToFirstUseValues = stats
      .filter(s => s.timeToFirstUse !== undefined)
      .map(s => s.timeToFirstUse!);
    
    const averageTimeToFirstUse = timeToFirstUseValues.length > 0 
      ? timeToFirstUseValues.reduce((a, b) => a + b, 0) / timeToFirstUseValues.length
      : 0;

    const topUsedBindings = stats
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map(s => ({
        id: s.bindingId,
        usage: s.usageCount,
        description: this.entries.get(s.bindingId)?.binding.description || "",
      }));

    return {
      totalBindings: entries.length,
      activeBindings: activeEntries.length,
      newBindings: newCount,
      seenBindings: seenCount,
      learnedBindings: learnedCount,
      averageTimeToFirstUse,
      topUsedBindings,
    };
  }

  /**
   * Clear all registry data (useful for testing)
   */
  public clear(): void {
    this.entries.clear();
    this.usageStats.clear();
    this.initializeContextIndex();
    this.categoryIndex.clear();
    this.tagIndex.clear();
  }
} 