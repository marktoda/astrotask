import type { KeyMapRegistry } from "./keymap-registry.js";
import type { ContextTracker } from "./context-tracker.js";
import type {
  PaneContext,
  FooterHint,
  HintScoringFactors,
  KeyBindingRegistryEntry,
  EnhancedKeyBinding,
} from "../types/keybinding.js";

export interface HintScoringConfig {
  /** Maximum number of hints to return */
  maxHints: number;
  
  /** Weight for base keybinding weight (0-1) */
  weightFactor: number;
  
  /** Weight for recency factor (0-1) */
  recencyFactor: number;
  
  /** Weight for context relevance (0-1) */
  contextFactor: number;
  
  /** Weight for learning progression (0-1) */
  learningFactor: number;
  
  /** Decay rate for recency scoring (days) */
  recencyDecayDays: number;
  
  /** Minimum score threshold for inclusion */
  minScore: number;
}

export interface UserLearningData {
  /** Keybindings the user has discovered but not mastered */
  discovering: Set<string>;
  
  /** Keybindings the user has used multiple times */
  learning: Set<string>;
  
  /** Keybindings the user has mastered */
  mastered: Set<string>;
  
  /** Average time between discovery and first use */
  averageTimeToFirstUse: number;
  
  /** Most frequently used contexts */
  frequentContexts: Map<PaneContext, number>;
}

/**
 * HintScorer calculates scores for keybindings to determine which should be
 * shown as footer hints based on multiple factors including weight, recency,
 * context relevance, and user learning patterns
 */
export class HintScorer {
  private registry: KeyMapRegistry;
  private contextTracker: ContextTracker;
  private config: HintScoringConfig;
  private learningData: UserLearningData;

  // Default configuration
  private static readonly DEFAULT_CONFIG: HintScoringConfig = {
    maxHints: 6,
    weightFactor: 0.4,
    recencyFactor: 0.2,
    contextFactor: 0.3,
    learningFactor: 0.1,
    recencyDecayDays: 7,
    minScore: 0.1,
  };

  constructor(
    registry: KeyMapRegistry,
    contextTracker: ContextTracker,
    config?: Partial<HintScoringConfig>
  ) {
    this.registry = registry;
    this.contextTracker = contextTracker;
    this.config = { ...HintScorer.DEFAULT_CONFIG, ...config };
    
    // Initialize learning data
    this.learningData = {
      discovering: new Set(),
      learning: new Set(),
      mastered: new Set(),
      averageTimeToFirstUse: 5000, // 5 seconds default
      frequentContexts: new Map(),
    };

    this.initializeLearningData();
  }

  /**
   * Get the best footer hints for the current context
   */
  public getFooterHints(context?: PaneContext): FooterHint[] {
    const currentContext = context || this.contextTracker.getCurrentContext();
    
    // For now, use essential hints for better UX
    return this.getEssentialHints(currentContext);
  }

  /**
   * Get essential curated hints for the current context
   */
  private getEssentialHints(context: PaneContext): FooterHint[] {
    // Define essential keybindings for each context
    const essentialKeys: Record<PaneContext, string[]> = {
      task_tree: ["j", "k", "a", "A", "e", "space", "q"],
      project_list: ["j", "k", "enter", "q"],
      task_detail: ["j", "k", "q"],
      global: ["q", "::", "tab"],
      command_palette: ["escape", "enter", "up", "down"],
      help_overlay: ["escape", "q", "?"],
      search: ["escape", "enter"],
      settings: ["escape", "q"],
    };

    const contextKeys = essentialKeys[context] || [];
    const candidates = this.getCandidateBindings(context);
    
    // Find bindings for essential keys
    const essentialHints: FooterHint[] = [];
    
    for (const key of contextKeys) {
      const binding = candidates.find(entry => entry.binding.key === key);
      if (binding) {
        essentialHints.push({
          binding: binding.binding,
          scoring: this.calculateScore(binding, context),
          displayText: this.generateDisplayText(binding.binding),
          keyText: this.generateKeyText(binding.binding),
        });
      }
    }

    // Take up to maxHints
    return essentialHints.slice(0, this.config.maxHints);
  }

  /**
   * Get scored footer hints (original algorithm)
   */
  public getScoredFooterHints(context?: PaneContext): FooterHint[] {
    const currentContext = context || this.contextTracker.getCurrentContext();
    
    // Get all relevant keybindings for the current context
    const candidates = this.getCandidateBindings(currentContext);
    
    // Score each candidate
    const scoredBindings = candidates.map(entry => {
      const scoring = this.calculateScore(entry, currentContext);
      return {
        entry,
        scoring,
        displayText: this.generateDisplayText(entry.binding),
        keyText: this.generateKeyText(entry.binding),
      };
    });

    // Filter by minimum score and sort by total score
    const validHints = scoredBindings
      .filter(hint => hint.scoring.totalScore >= this.config.minScore)
      .sort((a, b) => b.scoring.totalScore - a.scoring.totalScore);

    // Take top hints and convert to FooterHint format
    const result = validHints
      .slice(0, this.config.maxHints)
      .map(hint => ({
        binding: hint.entry.binding,
        scoring: hint.scoring,
        displayText: hint.displayText,
        keyText: hint.keyText,
      }));

    return result;
  }

  /**
   * Get candidate keybindings for scoring
   */
  private getCandidateBindings(context: PaneContext): KeyBindingRegistryEntry[] {
    // Get bindings for current context
    const contextBindings = this.registry.getByContext(context);
    
    // Also include global bindings that are always relevant
    const globalBindings = this.registry.getByContext("global");
    
    // Combine and deduplicate
    const allBindings = [...contextBindings, ...globalBindings];
    const candidateBindings: KeyBindingRegistryEntry[] = [];
    
    allBindings.forEach(entry => {
      // Add the main key binding
      candidateBindings.push(entry);
      
      // Add separate entries for each alias to make them appear as distinct hints
      if (entry.binding.aliases && entry.binding.aliases.length > 0) {
        entry.binding.aliases.forEach(alias => {
          // Create a new candidate with the alias as the main key
          const aliasCandidate: KeyBindingRegistryEntry = {
            ...entry,
            id: `${entry.id}-alias-${alias}`,
            binding: {
              ...entry.binding,
              key: alias,
              aliases: undefined, // Don't show aliases for alias entries
            }
          };
          candidateBindings.push(aliasCandidate);
        });
      }
    });

    // Filter out inactive bindings and those with conditions that don't match
    const filtered = candidateBindings.filter(entry => {
      if (!entry.active) return false;
      if (entry.binding.condition && !entry.binding.condition()) return false;
      return true;
    });
    
    return filtered;
  }

  /**
   * Calculate comprehensive scoring for a keybinding
   */
  private calculateScore(entry: KeyBindingRegistryEntry, context: PaneContext): HintScoringFactors {
    const weight = this.calculateWeightScore(entry.binding);
    const recencyFactor = this.calculateRecencyScore(entry);
    const contextRelevance = this.calculateContextRelevance(entry.binding, context);
    const learningFactor = this.calculateLearningScore(entry);

    // Weighted combination of all factors
    const totalScore = 
      (weight * this.config.weightFactor) +
      (recencyFactor * this.config.recencyFactor) +
      (contextRelevance * this.config.contextFactor) +
      (learningFactor * this.config.learningFactor);

    return {
      weight,
      recencyFactor,
      contextRelevance,
      learningFactor,
      totalScore: Math.max(0, Math.min(1, totalScore)), // Clamp to 0-1
    };
  }

  /**
   * Calculate weight-based score (base importance of the keybinding)
   */
  private calculateWeightScore(binding: EnhancedKeyBinding): number {
    const weight = binding.weight || 5; // Default weight is 5
    const priority = binding.priority || "medium";
    
    // Boost essential actions
    const isNavigation = ["j", "k", "up", "down", "↑", "↓"].includes(binding.key) ||
                         binding.description.toLowerCase().includes("up") ||
                         binding.description.toLowerCase().includes("down");
    
    const isTaskAction = binding.tags?.includes("add") || 
                        binding.tags?.includes("edit") ||
                        binding.tags?.includes("delete") ||
                        binding.description.toLowerCase().includes("add") ||
                        binding.description.toLowerCase().includes("edit") ||
                        binding.description.toLowerCase().includes("delete");
    
    const isToggleAction = binding.key === "space" || 
                          binding.description.toLowerCase().includes("toggle") ||
                          binding.description.toLowerCase().includes("cycle");
    
    // Very high priority actions (always want to see these)
    const isEssential = ["q", "a", "A", "e"].includes(binding.key) ||
                       binding.key === "space" ||
                       ["j", "k", "up", "down"].includes(binding.key);
    
    // Normalize weight (assuming max weight is 10)
    let score = Math.min(weight / 10, 1);
    
    // Apply boosts
    if (isEssential) {
      score *= 2.0; // 100% boost for essential actions
    } else if (isTaskAction) {
      score *= 1.5; // 50% boost for task management actions
    } else if (isNavigation) {
      score *= 1.3; // 30% boost for navigation
    } else if (isToggleAction) {
      score *= 1.2; // 20% boost for toggle actions
    }
    
    // Priority multiplier
    const priorityMultiplier = {
      low: 0.7,
      medium: 1.0,
      high: 1.3,
    }[priority];
    
    return score * priorityMultiplier;
  }

  /**
   * Calculate recency score based on when the binding was last used
   */
  private calculateRecencyScore(entry: KeyBindingRegistryEntry): number {
    const now = Date.now();
    const lastUsed = entry.stats.lastUsed;
    
    if (!lastUsed) {
      // Never used - give moderate score for discovery
      return 0.6;
    }

    const daysSinceUse = (now - lastUsed) / (1000 * 60 * 60 * 24);
    const decayRate = this.config.recencyDecayDays;
    
    // Exponential decay: more recent = higher score
    const recencyScore = Math.exp(-daysSinceUse / decayRate);
    
    // But also boost things that haven't been used in a while (rediscovery)
    const rediscoveryBoost = daysSinceUse > decayRate * 2 ? 0.3 : 0;
    
    return Math.min(recencyScore + rediscoveryBoost, 1);
  }

  /**
   * Calculate context relevance score
   */
  private calculateContextRelevance(binding: EnhancedKeyBinding, context: PaneContext): number {
    // Perfect match for context
    if (binding.context === context) {
      return 1.0;
    }

    // Global bindings are always somewhat relevant
    if (binding.context === "global") {
      return 0.7;
    }

    // Check if this context transition is common for the user
    const patterns = this.contextTracker.getNavigationPatterns();
    
    // If user frequently transitions between these contexts, increase relevance
    const transitionRelevance = patterns.recentTransitions.find(
      t => (t.from === context && t.to === binding.context) ||
           (t.from === binding.context && t.to === context)
    );
    
    if (transitionRelevance) {
      return 0.5 + (transitionRelevance.count / 10) * 0.3; // Up to 0.8
    }

    // Base relevance for related contexts
    return 0.2;
  }

  /**
   * Calculate learning progression score
   */
  private calculateLearningScore(entry: KeyBindingRegistryEntry): number {
    const bindingId = entry.id;
    const usageCount = entry.stats.usageCount;
    
    // Prioritize bindings in discovery phase
    if (this.learningData.discovering.has(bindingId)) {
      return 0.9; // High priority for new discoveries
    }
    
    // Moderate priority for learning phase
    if (this.learningData.learning.has(bindingId)) {
      return 0.6;
    }
    
    // Lower priority for mastered bindings
    if (this.learningData.mastered.has(bindingId)) {
      return 0.2; // Still show occasionally for reinforcement
    }
    
    // New bindings get discovery priority
    if (usageCount === 0) {
      return 0.8;
    }
    
    // Base learning score based on usage
    if (usageCount < 3) return 0.7; // Still learning
    if (usageCount < 10) return 0.4; // Getting familiar
    return 0.2; // Probably mastered
  }

  /**
   * Generate display text for a keybinding hint
   */
  private generateDisplayText(binding: EnhancedKeyBinding): string {
    // Use hint if available, otherwise use description
    const text = binding.hint || binding.description;
    
    // Truncate if too long for footer display
    const MAX_LENGTH = 20;
    if (text.length > MAX_LENGTH) {
      return text.substring(0, MAX_LENGTH - 3) + "...";
    }
    
    return text;
  }

  /**
   * Generate key text for display
   */
  private generateKeyText(binding: EnhancedKeyBinding): string {
    // Use the primary key, with some formatting for display
    let key = binding.key;
    
    // Simplify common key names for display
    const keyMappings: Record<string, string> = {
      "enter": "↵",
      "space": "␣",
      "tab": "⇥",
      "escape": "⎋",
      "up": "↑",
      "down": "↓",
      "left": "←",
      "right": "→",
    };
    
    // Replace long key names with symbols
    Object.entries(keyMappings).forEach(([longName, symbol]) => {
      key = key.replace(new RegExp(`\\b${longName}\\b`, 'gi'), symbol);
    });
    
    // Keep original case - don't auto-capitalize
    return key;
  }

  /**
   * Initialize learning data from usage statistics
   */
  private initializeLearningData(): void {
    const allEntries = this.registry.query(); // Get all entries
    
    allEntries.forEach((entry: KeyBindingRegistryEntry) => {
      const usageCount = entry.stats.usageCount;
      const bindingId = entry.id;
      
      if (usageCount === 0) {
        // Never used - potential for discovery
        this.learningData.discovering.add(bindingId);
      } else if (usageCount < 5) {
        // Low usage - in learning phase
        this.learningData.learning.add(bindingId);
      } else {
        // High usage - likely mastered
        this.learningData.mastered.add(bindingId);
      }
    });

    // Update frequent contexts from context tracker
    const patterns = this.contextTracker.getNavigationPatterns();
    this.learningData.frequentContexts = patterns.frequentContexts;
  }

  /**
   * Update learning data when a keybinding is used
   */
  public recordKeybindingUsage(bindingId: string): void {
    const entry = this.registry.get(bindingId); // Use get() instead of getById()
    if (!entry) return;

    const usageCount = entry.stats.usageCount;
    
    // Progress through learning stages
    if (this.learningData.discovering.has(bindingId) && usageCount >= 1) {
      this.learningData.discovering.delete(bindingId);
      this.learningData.learning.add(bindingId);
    } else if (this.learningData.learning.has(bindingId) && usageCount >= 5) {
      this.learningData.learning.delete(bindingId);
      this.learningData.mastered.add(bindingId);
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<HintScoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): HintScoringConfig {
    return { ...this.config };
  }

  /**
   * Get learning data for analytics
   */
  public getLearningData(): UserLearningData {
    return {
      discovering: new Set(this.learningData.discovering),
      learning: new Set(this.learningData.learning),
      mastered: new Set(this.learningData.mastered),
      averageTimeToFirstUse: this.learningData.averageTimeToFirstUse,
      frequentContexts: new Map(this.learningData.frequentContexts),
    };
  }

  /**
   * Force refresh of learning data
   */
  public refreshLearningData(): void {
    this.learningData.discovering.clear();
    this.learningData.learning.clear();
    this.learningData.mastered.clear();
    this.initializeLearningData();
  }
} 