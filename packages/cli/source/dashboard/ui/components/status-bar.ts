import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";
import type { Task } from "@astrolabe/core";

export class StatusBar {
  private box: blessed.Widgets.BoxElement;
  private unsubscribe: () => void;
  
  constructor(
    private parent: blessed.Widgets.Node,
    private store: StoreApi<DashboardStore>
  ) {
    // Create the status bar
    this.box = blessed.box({
      parent: this.parent,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      style: {
        bg: "black",
        fg: "white"
      }
    });
    
    // Subscribe to store updates
    this.unsubscribe = this.store.subscribe((state) => {
      this.render(state);
    });
    
    // Initial render
    this.render(this.store.getState());
  }
  
  private render(state: DashboardStore) {
    const { activePanel, statusMessage, projectTree, commandPaletteOpen, helpOverlayOpen } = state;
    
    // Build status content
    const parts: string[] = [];
    
    // Active panel indicator
    const panelNames = {
      sidebar: "Projects",
      tree: "Tasks", 
      details: "Details"
    };
    parts.push(panelNames[activePanel]);
    
    // Task count and progress
    if (projectTree) {
      const allTasks: Task[] = [];
      projectTree.walkDepthFirst((node) => {
        allTasks.push(node.task);
      });
      
      const totalTasks = allTasks.length;
      const doneCount = allTasks.filter((t: Task) => t.status === "done").length;
      parts.push(`${doneCount}/${totalTasks} tasks`);
    }
    
    // Overlay status
    if (commandPaletteOpen) {
      parts.push("COMMAND");
    }
    if (helpOverlayOpen) {
      parts.push("HELP");
    }
    
    // Build full status line
    const left = parts.join(" | ");
    const right = statusMessage || "Press ? for help";
    const width = typeof this.box.width === "number" ? this.box.width : 80;
    const padding = Math.max(0, width - left.length - right.length - 2);
    const content = `${left}${" ".repeat(padding)}${right}`;
    
    this.box.setContent(content);
    this.box.screen.render();
  }
  
  setPosition(position: blessed.Widgets.Position) {
    Object.assign(this.box, position);
  }
  
  focus() {
    // Status bar doesn't take focus
  }
  
  destroy() {
    this.unsubscribe();
    this.box.destroy();
  }
} 