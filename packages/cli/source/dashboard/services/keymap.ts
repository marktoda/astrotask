import type blessed from "blessed";

export interface Keymap {
  [key: string]: {
    keys: string[];
    description: string;
    action: () => void;
  };
}

export class KeymapService {
  private keymaps: Map<string, Keymap> = new Map();
  private globalKeymap: Keymap = {
    quit: {
      keys: ["q", "C-c"],
      description: "Quit application (double tap)",
      action: () => {}
    },
    help: {
      keys: ["?"],
      description: "Show help overlay",
      action: () => {}
    },
    commandPalette: {
      keys: [":"],
      description: "Open command palette",
      action: () => {}
    },
    nextPanel: {
      keys: ["tab"],
      description: "Focus next panel",
      action: () => {}
    },
    prevPanel: {
      keys: ["S-tab"],
      description: "Focus previous panel",
      action: () => {}
    }
  };
  
  constructor() {
    // Initialize default keymaps
    this.keymaps.set("global", this.globalKeymap);
    this.keymaps.set("taskTree", this.createTaskTreeKeymap());
    this.keymaps.set("projectSidebar", this.createProjectSidebarKeymap());
  }
  
  private createTaskTreeKeymap(): Keymap {
    return {
      moveUp: {
        keys: ["up", "k"],
        description: "Move cursor up",
        action: () => {}
      },
      moveDown: {
        keys: ["down", "j"],
        description: "Move cursor down",
        action: () => {}
      },
      expand: {
        keys: ["right", "l", "enter"],
        description: "Expand node",
        action: () => {}
      },
      collapse: {
        keys: ["left", "h"],
        description: "Collapse node",
        action: () => {}
      },
      toggleComplete: {
        keys: ["space", "enter"],
        description: "Toggle task completion",
        action: () => {}
      },
      addSibling: {
        keys: ["a"],
        description: "Add sibling task",
        action: () => {}
      },
      addChild: {
        keys: ["A"],
        description: "Add child task",
        action: () => {}
      },
      delete: {
        keys: ["D"],
        description: "Delete task (with confirmation)",
        action: () => {}
      },
      addDependency: {
        keys: ["b"],
        description: "Add dependency",
        action: () => {}
      },
      removeDependency: {
        keys: ["B"],
        description: "Remove dependency",
        action: () => {}
      },
      expandAll: {
        keys: ["*"],
        description: "Expand all nodes",
        action: () => {}
      },
      collapseAll: {
        keys: ["_"],
        description: "Collapse all nodes",
        action: () => {}
      }
    };
  }
  
  private createProjectSidebarKeymap(): Keymap {
    return {
      selectProject: {
        keys: ["enter"],
        description: "Select project",
        action: () => {}
      },
      moveUp: {
        keys: ["up", "k"],
        description: "Move up",
        action: () => {}
      },
      moveDown: {
        keys: ["down", "j"],
        description: "Move down",
        action: () => {}
      }
    };
  }
  
  getKeymap(context: string): Keymap {
    return this.keymaps.get(context) || {};
  }
  
  getAllKeymaps(): Map<string, Keymap> {
    return new Map(this.keymaps);
  }
  
  bindKeys(element: blessed.Widgets.BlessedElement, context: string, handlers: Record<string, () => void>) {
    const keymap = this.getKeymap(context);
    
    for (const [action, config] of Object.entries(keymap)) {
      if (handlers[action]) {
        element.key(config.keys, handlers[action]);
      }
    }
  }
  
  getKeysForAction(context: string, action: string): string[] {
    const keymap = this.getKeymap(context);
    return keymap[action]?.keys || [];
  }
  
  getDescriptionForAction(context: string, action: string): string {
    const keymap = this.getKeymap(context);
    return keymap[action]?.description || "";
  }
} 