import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";
import type { Task, TaskTree } from "@astrolabe/core";

export class TaskTreeComponent {
  private list: blessed.Widgets.ListElement;
  private unsubscribe: () => void;
  private lastKeyPress: number = 0;
  private keyDebounceMs: number = 150; // Prevent rapid key repeats
  private isRendering: boolean = false; // Prevent selection events during render
  private spaceKeyHandler: (() => void) | null = null; // Reference to space key handler for cleanup
  
  constructor(
    private parent: blessed.Widgets.Node,
    private store: StoreApi<DashboardStore>
  ) {
    // Create the list widget
    this.list = blessed.list({
      parent: this.parent,
      label: " Task Tree ",
      border: {
        type: "line"
      },
      style: {
        border: {
          fg: "cyan"
        },
        selected: {
          bg: "blue",
          fg: "black",
          bold: true
        },
        focus: {
          border: {
            fg: "yellow"
          }
        },
        item: {
          hover: {
            bg: "gray"
          }
        }
      },
      keys: false, // Disable built-in key handling to prevent conflicts
      vi: false,
      mouse: true,
      scrollable: true,
      interactive: true,
      focusable: true,
      scrollbar: {
        ch: " ",
        track: {
          bg: "gray"
        },
        style: {
          inverse: true
        }
      }
    } as any);
    
    this.setupEventHandlers();
    
    // Subscribe to store updates
    this.unsubscribe = this.store.subscribe((state) => {
      this.render(state);
    });
    
    // Initial render
    this.render(this.store.getState());
  }
  
  private setupEventHandlers() {
    const state = () => this.store.getState();
    
    // Make sure the list can receive key events
    this.list.on("focus", () => {
      this.list.setFront();
    });
    
    // Arrow key navigation - explicit handlers
    this.list.key(["up", "k"], () => {
      const currentIndex = (this.list as any).selected || 0;
      if (currentIndex > 0) {
        this.list.select(currentIndex - 1);
        this.list.screen.render();
      }
    });
    
    this.list.key(["down", "j"], () => {
      const currentIndex = (this.list as any).selected || 0;
      if (currentIndex < (this.list as any).items.length - 1) {
        this.list.select(currentIndex + 1);
        this.list.screen.render();
      }
    });
    
    // Key handlers
    this.list.key(["enter"], () => {
      const selected = (this.list as any).selected;
      const taskId = this.getTaskIdFromIndex(selected);
      if (taskId) {
        const projectTree = state().projectTree;
        if (projectTree) {
          const taskNode = projectTree.find((task: Task) => task.id === taskId);
          if (taskNode) {
            const newStatus = taskNode.task.status === "done" ? "pending" : "done";
            state().updateTaskStatus(taskId, newStatus);
          }
        }
      }
    });
    
    // Handle space key at screen level to avoid blessed interference
    this.spaceKeyHandler = () => {
      // Only handle if this list is focused
      if (this.list.screen.focused === this.list) {
        const selected = (this.list as any).selected;
        const taskId = this.getTaskIdFromIndex(selected);
        if (taskId) {
          const projectTree = state().projectTree;
          if (projectTree) {
            const taskNode = projectTree.find((task: Task) => task.id === taskId);
            if (taskNode) {
              const newStatus = taskNode.task.status === "done" ? "pending" : "done";
              state().updateTaskStatus(taskId, newStatus);
              // Force screen render to update UI
              this.list.screen.render();
            }
          }
        }
      }
    };
    this.list.screen.key(["space"], this.spaceKeyHandler);
    
    this.list.key(["right", "l"], () => {
      const now = Date.now();
      if (now - this.lastKeyPress < this.keyDebounceMs) {
        return; // Ignore rapid key repeats
      }
      this.lastKeyPress = now;
      
      const taskId = this.getTaskIdFromIndex((this.list as any).selected);
      if (taskId) {
        const projectTree = state().projectTree;
        if (projectTree) {
          const taskNode = projectTree.find((task: Task) => task.id === taskId);
          if (taskNode) {
            const childrenCount = taskNode.getChildren().length;
            if (childrenCount > 0) {
              state().toggleTaskExpanded(taskId);
            }
          }
        }
      }
    });
    
    this.list.key(["left", "h"], () => {
      const now = Date.now();
      if (now - this.lastKeyPress < this.keyDebounceMs) {
        return; // Ignore rapid key repeats
      }
      this.lastKeyPress = now;
      
      const taskId = this.getTaskIdFromIndex((this.list as any).selected);
      if (taskId) {
        const projectTree = state().projectTree;
        if (projectTree) {
          const taskNode = projectTree.find((task: Task) => task.id === taskId);
          if (taskNode && taskNode.getChildren().length > 0) {
            state().toggleTaskExpanded(taskId);
          }
        }
      }
    });
    
    this.list.key(["a"], () => {
      const taskId = this.getTaskIdFromIndex((this.list as any).selected);
      if (taskId) {
        const projectTree = state().projectTree;
        if (projectTree) {
          const taskNode = projectTree.find(t => t.id === taskId);
          if (taskNode) {
            // Add sibling task
            this.promptForTaskTitle((title) => {
              state().addTask(taskNode.task.parentId || null, title);
            });
          }
        }
      }
    });
    
    this.list.key(["A"], () => {
      const taskId = this.getTaskIdFromIndex((this.list as any).selected);
      if (taskId) {
        // Add child task
        this.promptForTaskTitle((title) => {
          state().addTask(taskId, title);
        });
      }
    });
    
    this.list.key(["D"], () => {
      const taskId = this.getTaskIdFromIndex((this.list as any).selected);
      if (taskId) {
        const projectTree = state().projectTree;
        if (projectTree) {
          const taskNode = projectTree.find(t => t.id === taskId);
          if (taskNode) {
            this.confirmDelete(taskNode.task, () => {
              state().deleteTask(taskId);
            });
          }
        }
      }
    });
    
    this.list.key(["*"], () => {
      state().expandAll();
    });
    
    this.list.key(["_"], () => {
      state().collapseAll();
    });
    
    // Selection change
    this.list.on("select item", (_el, selected) => {
      if (this.isRendering) return; // Skip during render
      const taskId = this.getTaskIdFromIndex(selected);
      if (taskId) {
        state().selectTask(taskId);
      }
    });
    
    // Use the list's native select handling
    this.list.on("select", () => {
      if (this.isRendering) return; // Skip during render
      const selected = (this.list as any).selected;
      const taskId = this.getTaskIdFromIndex(selected);
      if (taskId) {
        state().selectTask(taskId);
      }
    });
  }
  
  private promptForTaskTitle(callback: (title: string) => void) {
    const prompt = blessed.prompt({
      parent: this.list.screen,
      top: "center",
      left: "center",
      height: "shrink",
      width: "50%",
      border: {
        type: "line"
      },
      style: {
        border: {
          fg: "yellow"
        }
      }
    });
    
    prompt.input("Enter task title:", "", (err, value) => {
      if (!err && value) {
        callback(value);
      }
    });
  }
  
  private confirmDelete(task: Task, callback: () => void) {
    const question = blessed.question({
      parent: this.list.screen,
      top: "center",
      left: "center",
      height: "shrink",
      width: "50%",
      border: {
        type: "line"
      },
      style: {
        border: {
          fg: "red"
        }
      }
    });
    
    question.ask(`Delete task "${task.title}"? (y/n)`, (err, value) => {
      if (!err && value && value.toLowerCase() === "y") {
        callback();
      }
    });
  }
  
  private render(state: DashboardStore) {
    this.isRendering = true;
    
    const items = this.buildTreeItems(state);
    
    // Store items data before setItems to prevent race condition
    (this.list as any)._itemsWithData = items;
    
    // Set items without ANSI codes to avoid blessed parsing issues
    const plainItems = items.map(item => stripAnsi(item.label));
    this.list.setItems(plainItems);
    
    // Restore selection
    if (state.selectedTaskId) {
      const index = items.findIndex(item => item.taskId === state.selectedTaskId);
      if (index >= 0) {
        this.list.select(index);
      }
    } else if ((this.list as any).selected === undefined && items.length > 0) {
      // If nothing selected, select first item
      this.list.select(0);
      const firstTaskId = this.getTaskIdFromIndex(0);
      if (firstTaskId) {
        state.selectTask(firstTaskId);
      }
    }
    
    this.isRendering = false;
    this.list.screen.render();
  }
  
  private buildTreeItems(state: DashboardStore): Array<{ label: string; taskId: string; level: number }> {
    const items: Array<{ label: string; taskId: string; level: number }> = [];
    const { projectTree, expandedTaskIds, progressByTaskId, dependenciesByTaskId, blockingTaskIds } = state;
    
    if (!projectTree) return items;
    
    // Build task hierarchy starting with project children (root tasks)
    const rootTasks = projectTree.getChildren();
    
    const addTask = (taskNode: TaskTree, level: number) => {
      const task = taskNode.task;
      
      // Build label
      const indent = "  ".repeat(level);
      const checkbox = task.status === "done" ? "[✓]" : "[ ]";
      const expandIcon = taskNode.getChildren().length > 0
        ? (expandedTaskIds.has(task.id) ? "▼" : "▶") 
        : "  ";
      const progress = progressByTaskId.get(task.id) || 0;
      const progressStr = taskNode.getChildren().length > 0 ? ` (${Math.round(progress)}%)` : "";
      
      // Status indicators - use plain text, blessed will handle colors
      const priorityIcon = getPriorityIcon(task.priority);
      
      // Dependency indicators
      const deps = dependenciesByTaskId.get(task.id) || [];
      const blocking = blockingTaskIds.get(task.id) || [];
      const depIndicator = deps.length > 0 ? " ⎋" : "";
      const blockingIndicator = blocking.length > 0 ? " ⊗" : "";
      
      // Build label without chalk colors to avoid blessed parsing issues
      const label = `${indent}${expandIcon} ${checkbox} ${task.title}${progressStr}${priorityIcon}${depIndicator}${blockingIndicator}`;
      
      items.push({ label, taskId: task.id, level });
      
      // Add children if expanded
      if (expandedTaskIds.has(task.id)) {
        const children = taskNode.getChildren();
        children.forEach((child: TaskTree) => addTask(child, level + 1));
      }
    };
    
    rootTasks.forEach((taskNode: TaskTree) => addTask(taskNode, 0));
    
    return items;
  }
  
  private getTaskIdFromIndex(index: number): string | null {
    const itemsWithData = (this.list as any)._itemsWithData;
    if (itemsWithData && itemsWithData[index]) {
      return itemsWithData[index].taskId;
    }
    return null;
  }
  
  setPosition(position: blessed.Widgets.Position) {
    Object.assign(this.list, position);
  }
  
  // Public navigation methods
  moveUp() {
    const currentIndex = (this.list as any).selected || 0;
    if (currentIndex > 0) {
      this.list.select(currentIndex - 1);
      this.list.screen.render();
    }
  }
  
  moveDown() {
    const currentIndex = (this.list as any).selected || 0;
    const itemCount = (this.list as any).items.length;
    if (currentIndex < itemCount - 1) {
      this.list.select(currentIndex + 1);
      this.list.screen.render();
    }
  }
  
  expandCurrent() {
    const taskId = this.getTaskIdFromIndex((this.list as any).selected);
    if (taskId) {
      const state = this.store.getState();
      const projectTree = state.projectTree;
      if (projectTree) {
        const taskNode = projectTree.find((task: Task) => task.id === taskId);
        if (taskNode && taskNode.getChildren().length > 0) {
          state.toggleTaskExpanded(taskId);
        }
      }
    }
  }
  
  collapseCurrent() {
    const taskId = this.getTaskIdFromIndex((this.list as any).selected);
    if (taskId) {
      const state = this.store.getState();
      const projectTree = state.projectTree;
      if (projectTree) {
        const taskNode = projectTree.find((task: Task) => task.id === taskId);
        if (taskNode && taskNode.getChildren().length > 0) {
          state.toggleTaskExpanded(taskId);
        }
      }
    }
  }
  
  focus() {
    this.list.focus();
    this.list.setFront();
    // Ensure we have a selected item
    if ((this.list as any).selected === undefined && (this.list as any).items.length > 0) {
      this.list.select(0);
    }
    this.list.screen.render();
  }
  
  destroy() {
    this.unsubscribe();
    
    // Remove space key handler from screen
    if (this.spaceKeyHandler) {
      this.list.screen.removeKey("space", this.spaceKeyHandler);
      this.spaceKeyHandler = null;
    }
    
    this.list.destroy();
  }
}

// Helper functions
function getPriorityIcon(priority: Task["priority"]): string {
  switch (priority) {
    case "high": return " ⚡";
    case "low": return " ↓";
    default: return "";
  }
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[mGKH]/g, '');
} 