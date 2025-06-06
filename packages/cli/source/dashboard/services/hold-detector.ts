import type blessed from "blessed";

export interface HoldDetectorConfig {
  /** Minimum hold duration in milliseconds to trigger */
  holdDuration: number;
  /** Keys that trigger the hold detection */
  triggerKeys: string[];
  /** Function called when hold is detected */
  onHoldDetected: () => void;
  /** Function called when hold is released before threshold */
  onHoldCanceled?: () => void;
}

export interface HoldState {
  isHolding: boolean;
  startTime: number | null;
  timer: NodeJS.Timeout | null;
  triggeredKey: string | null;
}

/**
 * Service for detecting key hold events, specifically designed for Ctrl-K hold detection
 * to trigger the key ring overlay without conflicting with other shortcuts.
 */
export class HoldDetectorService {
  private config: HoldDetectorConfig;
  private state: HoldState = {
    isHolding: false,
    startTime: null,
    timer: null,
    triggeredKey: null,
  };
  private screen: blessed.Widgets.Screen | null = null;

  constructor(config: HoldDetectorConfig) {
    this.config = config;
  }

  /**
   * Attach the hold detector to a blessed screen
   */
  attach(screen: blessed.Widgets.Screen): void {
    this.screen = screen;
    this.setupKeyHandlers();
  }

  /**
   * Detach the hold detector from the screen
   */
  detach(): void {
    this.cleanup();
    this.screen = null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HoldDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current hold state (for debugging/testing)
   */
  getState(): Readonly<HoldState> {
    return { ...this.state };
  }

  private setupKeyHandlers(): void {
    if (!this.screen) return;

    // Handle keypress events for hold detection
    this.screen.on("keypress", (_ch: string, key: any) => {
      this.handleKeyPress(key);
    });

    // Handle key release by monitoring for any other key press
    // This is a workaround since blessed doesn't provide native key-up events
    this.screen.on("keypress", (_ch: string, key: any) => {
      this.handleOtherKeyPress(key);
    });
  }

  private handleKeyPress(key: any): void {
    if (!key) return;

    const keyName = this.normalizeKeyName(key);
    
    if (this.config.triggerKeys.includes(keyName)) {
      this.startHoldDetection(keyName);
    } else if (this.state.isHolding) {
      // Any other key press while holding cancels the hold
      this.cancelHold();
    }
  }

  private handleOtherKeyPress(key: any): void {
    if (!key || !this.state.isHolding) return;

    const keyName = this.normalizeKeyName(key);
    
    // If we get the same key again quickly, treat it as a release
    if (this.state.triggeredKey === keyName) {
      const now = Date.now();
      const elapsed = this.state.startTime ? now - this.state.startTime : 0;
      
      // If less than 50ms has passed, treat as key repeat/bounce
      if (elapsed < 50) {
        return;
      }
      
      // If we haven't reached the hold threshold, cancel
      if (elapsed < this.config.holdDuration) {
        this.cancelHold();
      }
      // If we have reached threshold, the timer already fired
    }
  }

  private startHoldDetection(keyName: string): void {
    // Clear any existing hold state
    this.cleanup();

    this.state = {
      isHolding: true,
      startTime: Date.now(),
      triggeredKey: keyName,
      timer: setTimeout(() => {
        this.triggerHold();
      }, this.config.holdDuration),
    };
  }

  private triggerHold(): void {
    if (this.state.isHolding) {
      this.config.onHoldDetected();
      this.cleanup();
    }
  }

  private cancelHold(): void {
    if (this.state.isHolding && this.config.onHoldCanceled) {
      this.config.onHoldCanceled();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.state.timer) {
      clearTimeout(this.state.timer);
    }
    
    this.state = {
      isHolding: false,
      startTime: null,
      timer: null,
      triggeredKey: null,
    };
  }

  private normalizeKeyName(key: any): string {
    // Handle different key formats from blessed
    if (typeof key === "string") {
      return key.toLowerCase();
    }
    
    if (key && typeof key === "object") {
      // Try different blessed key properties
      if (key.full) {
        return key.full.toLowerCase();
      }
      if (key.name) {
        const name = key.name.toLowerCase();
        // Handle ctrl combinations
        if (key.ctrl && name === "k") {
          return "c-k";
        }
        return name;
      }
      if (key.sequence) {
        return key.sequence.toLowerCase();
      }
    }
    
    return "";
  }

  /**
   * Manually trigger hold detection (for testing)
   */
  triggerManually(): void {
    this.config.onHoldDetected();
  }

  /**
   * Check if currently holding a key
   */
  isCurrentlyHolding(): boolean {
    return this.state.isHolding;
  }
} 