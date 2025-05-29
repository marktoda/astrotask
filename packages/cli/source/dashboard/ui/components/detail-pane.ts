import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";
import type { Task } from "@astrolabe/core";

export class DetailPane {
  private box: blessed.Widgets.BoxElement;
  private content: blessed.Widgets.TextElement;
  private unsubscribe: () => void;
  
  constructor(
    private parent: blessed.Widgets.Node,
    private store: StoreApi<DashboardStore>
  ) {
    // Create the container box
    this.box = blessed.box({
      parent: this.parent,
      label: " Task Details ",
      border: {
        type: "line"
      },
      style: {
        border: {
          fg: "cyan"
        },
        focus: {
          border: {
            fg: "yellow"
          }
        }
      }
    });
    
    // Create the content text
    this.content = blessed.text({
      parent: this.box,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      scrollable: true,
      keys: true,
      mouse: true,
      padding: 1,
      tags: true,  // Enable blessed tag parsing
      style: {
        scrollbar: {
          bg: "gray"
        }
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
    const { selectedTaskId, projectTree } = state;
    
    if (!selectedTaskId || !projectTree) {
      this.content.setContent("No task selected");
      this.box.screen.render();
      return;
    }
    
    const taskNode = projectTree.find((task: Task) => task.id === selectedTaskId);
    if (!taskNode) {
      this.content.setContent("Task not found");
      this.box.screen.render();
      return;
    }
    
    const task = taskNode.task;
    const lines: string[] = [];
    
    // Header
    lines.push(`Task: ${task.title}`);
    lines.push(`ID: ${task.id}`);
    lines.push(`Status: ${task.status}`);
    lines.push(`Priority: ${task.priority}`);
    lines.push("");
    
    // Description
    if (task.description) {
      lines.push("Description:");
      lines.push(task.description);
      lines.push("");
    }
    
    // Subtasks
    const hasSubtasks = taskNode.getChildren().length > 0;
    if (hasSubtasks) {
      lines.push("Subtasks:");
      const children = taskNode.getChildren();
      children.forEach((child) => {
        const status = child.task.status === "done" ? "✓" : "○";
        lines.push(`  ${status} ${child.task.title}`);
      });
      lines.push("");
    }
    
    // Dependencies
    const deps = state.dependenciesByTaskId.get(task.id) || [];
    if (deps.length > 0) {
      lines.push("Dependencies:");
      deps.forEach((depId) => {
        const depTaskNode = projectTree.find((task: Task) => task.id === depId);
        if (depTaskNode) {
          const status = depTaskNode.task.status === "done" ? "✓" : "○";
          lines.push(`  ${status} ${depTaskNode.task.title}`);
        }
      });
      lines.push("");
    }
    
    // Blocked by
    const blocking = state.blockingTaskIds.get(task.id) || [];
    if (blocking.length > 0) {
      lines.push("Blocks:");
      blocking.forEach((blockedId) => {
        const blockedTaskNode = projectTree.find((task: Task) => task.id === blockedId);
        if (blockedTaskNode) {
          const status = blockedTaskNode.task.status === "done" ? "✓" : "○";
          lines.push(`  ${status} ${blockedTaskNode.task.title}`);
        }
      });
      lines.push("");
    }
    
    this.content.setContent(lines.join("\n"));
    this.box.screen.render();
  }
  
  setPosition(position: blessed.Widgets.Position) {
    Object.assign(this.box, position);
  }
  
  focus() {
    this.content.focus();
  }
  
  destroy() {
    this.unsubscribe();
    this.box.destroy();
  }
} 