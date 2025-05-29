import { create } from "zustand";
import type { Task, createDatabase } from "@astrolabe/core";
import { TaskService, TaskTree } from "@astrolabe/core";

export interface DashboardState {
  // Task tree data
  projectTree: TaskTree | null;
  selectedTaskId: string | null;
  expandedTaskIds: Set<string>;
  
  // UI state
  activePanel: "sidebar" | "tree" | "details";
  commandPaletteOpen: boolean;
  helpOverlayOpen: boolean;
  statusMessage: string;
  confirmExit: boolean;
  
  // Project data (derived from projectTree.getChildren())
  projects: Project[];
  selectedProjectId: string | null;
  
  // Progress cache
  progressByTaskId: Map<string, number>;
  
  // Dependencies
  dependenciesByTaskId: Map<string, string[]>;
  blockingTaskIds: Map<string, string[]>; // reverse lookup
}

export interface Project {
  id: string;
  name: string;
  rootTaskId: string;
  progress: number;
}

export interface DashboardActions {
  // Task actions
  loadTasks: () => Promise<void>;
  selectTask: (taskId: string | null) => void;
  toggleTaskExpanded: (taskId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  
  // Task CRUD
  addTask: (parentId: string | null, title: string) => Promise<void>;
  updateTaskStatus: (taskId: string, status: Task["status"]) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  
  // Dependency actions
  addDependency: (taskId: string, dependsOnId: string) => Promise<void>;
  removeDependency: (taskId: string, dependsOnId: string) => Promise<void>;
  
  // UI actions
  setActivePanel: (panel: DashboardState["activePanel"]) => void;
  toggleCommandPalette: () => void;
  toggleHelpOverlay: () => void;
  setStatusMessage: (message: string) => void;
  setConfirmExit: (confirm: boolean) => void;
  
  // Project actions
  selectProject: (projectId: string | null) => void;
  
  // Tree operations
  getTaskTree: (taskId: string) => TaskTree | null;
  getAllTasks: () => Task[];
  getProjects: () => TaskTree[];
  
  // Progress calculation
  calculateProgress: (taskId: string) => number;
  recalculateAllProgress: () => void;
}

export type DashboardStore = DashboardState & DashboardActions;

type DatabaseStore = Awaited<ReturnType<typeof createDatabase>>;

export function createDashboardStore(db: DatabaseStore) {
  const taskService = new TaskService(db);
  
  const useStore = create<DashboardStore>((set, get) => ({
    // Initial state
    projectTree: null,
    selectedTaskId: null,
    expandedTaskIds: new Set(),
    activePanel: "tree",
    commandPaletteOpen: false,
    helpOverlayOpen: false,
    statusMessage: "Ready",
    confirmExit: false,
    projects: [],
    selectedProjectId: null,
    progressByTaskId: new Map(),
    dependenciesByTaskId: new Map(),
    blockingTaskIds: new Map(),
    
    // Task actions
    loadTasks: async () => {
      try {
        // Use TaskService to get the project tree
        const projectTree = await taskService.getTaskTree();
        
        if (!projectTree) {
          set({ 
            projectTree: null,
            projects: [],
            statusMessage: "No tasks found" 
          });
          return;
        }
        
        // Get projects as children of project root
        const projects: Project[] = projectTree.getChildren().map(projectNode => ({
          id: projectNode.task.id,
          name: projectNode.task.title,
          rootTaskId: projectNode.task.id,
          progress: 0 // Will be calculated
        }));
        
        // Build dependency maps (still manual for now)
        const dependenciesByTaskId = new Map<string, string[]>();
        const blockingTaskIds = new Map<string, string[]>();
        
        set({
          projectTree,
          projects,
          dependenciesByTaskId,
          blockingTaskIds
        });
        
        // Calculate progress
        get().recalculateAllProgress();
        
      } catch (error) {
        set({ statusMessage: `Error loading tasks: ${error}` });
      }
    },
    
    selectTask: (taskId) => {
      set({ selectedTaskId: taskId });
    },
    
    toggleTaskExpanded: (taskId) => {
      const expanded = new Set(get().expandedTaskIds);
      if (expanded.has(taskId)) {
        expanded.delete(taskId);
      } else {
        expanded.add(taskId);
      }
      set({ expandedTaskIds: expanded });
    },
    
    expandAll: () => {
      const expanded = new Set<string>();
      const projectTree = get().projectTree;
      if (projectTree) {
        projectTree.walkDepthFirst((node) => {
          if (node.getChildren().length > 0) {
            expanded.add(node.task.id);
          }
        });
      }
      set({ expandedTaskIds: expanded });
    },
    
    collapseAll: () => {
      set({ expandedTaskIds: new Set() });
    },
    
    // Task CRUD
    addTask: async (parentId, title) => {
      try {
        await db.addTask({
          title,
          parentId: parentId || undefined,
          status: "pending",
          priority: "medium",
          description: undefined
        });
        await get().loadTasks();
        set({ statusMessage: `Added task: ${title}` });
      } catch (error) {
        set({ statusMessage: `Error adding task: ${error}` });
      }
    },
    
    updateTaskStatus: async (taskId, status) => {
      try {
        await db.updateTask(taskId, { status });
        await get().loadTasks();
        set({ statusMessage: `Updated task status to ${status}` });
      } catch (error) {
        set({ statusMessage: `Error updating task: ${error}` });
      }
    },
    
    deleteTask: async (taskId) => {
      try {
        await db.deleteTask(taskId);
        await get().loadTasks();
        set({ statusMessage: "Task deleted" });
      } catch (error) {
        set({ statusMessage: `Error deleting task: ${error}` });
      }
    },
    
    // Dependency actions
    addDependency: async (taskId, dependsOnId) => {
      try {
        // Since Task doesn't have dependencyIds, we'll need to handle this differently
        // For now, just update the internal state
        const deps = get().dependenciesByTaskId;
        const currentDeps = deps.get(taskId) || [];
        deps.set(taskId, [...currentDeps, dependsOnId]);
        
        const blocking = get().blockingTaskIds;
        const currentBlocking = blocking.get(dependsOnId) || [];
        blocking.set(dependsOnId, [...currentBlocking, taskId]);
        
        set({ 
          dependenciesByTaskId: new Map(deps),
          blockingTaskIds: new Map(blocking),
          statusMessage: "Dependency added"
        });
      } catch (error) {
        set({ statusMessage: `Error adding dependency: ${error}` });
      }
    },
    
    removeDependency: async (taskId, dependsOnId) => {
      try {
        const deps = get().dependenciesByTaskId;
        const currentDeps = deps.get(taskId) || [];
        deps.set(taskId, currentDeps.filter(id => id !== dependsOnId));
        
        const blocking = get().blockingTaskIds;
        const currentBlocking = blocking.get(dependsOnId) || [];
        blocking.set(dependsOnId, currentBlocking.filter(id => id !== taskId));
        
        set({ 
          dependenciesByTaskId: new Map(deps),
          blockingTaskIds: new Map(blocking),
          statusMessage: "Dependency removed"
        });
      } catch (error) {
        set({ statusMessage: `Error removing dependency: ${error}` });
      }
    },
    
    // UI actions
    setActivePanel: (panel) => {
      set({ activePanel: panel });
    },
    
    toggleCommandPalette: () => {
      set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen }));
    },
    
    toggleHelpOverlay: () => {
      set((state) => ({ helpOverlayOpen: !state.helpOverlayOpen }));
    },
    
    setStatusMessage: (message) => {
      set({ statusMessage: message });
    },
    
    setConfirmExit: (confirm) => {
      set({ confirmExit: confirm });
    },
    
    // Project actions
    selectProject: (projectId) => {
      set({ selectedProjectId: projectId });
    },
    
    // Tree operations
    getTaskTree: (taskId: string) => {
      const projectTree = get().projectTree;
      if (!projectTree) return null;
      return projectTree.find(task => task.id === taskId);
    },
    
    getAllTasks: () => {
      const projectTree = get().projectTree;
      if (!projectTree) return [];
      const tasks: Task[] = [];
      projectTree.walkDepthFirst((node) => {
        tasks.push(node.task);
      });
      return tasks;
    },
    
    getProjects: () => {
      const projectTree = get().projectTree;
      if (!projectTree) return [];
      return [...projectTree.getChildren()];
    },
    
    // Progress calculation
    calculateProgress: (taskId: string) => {
      const state = get();
      const projectTree = state.projectTree;
      if (!projectTree) return 0;
      
      const taskNode = projectTree.find(task => task.id === taskId);
      if (!taskNode) return 0;
      
      const children = taskNode.getChildren();
      if (children.length === 0) {
        // Leaf node
        return taskNode.task.status === "done" ? 100 : 0;
      }
      
      // Calculate based on children
      let totalProgress = 0;
      let validChildren = 0;
      
      for (const child of children) {
        if (child.task.status !== "cancelled" && child.task.status !== "archived") {
          totalProgress += state.calculateProgress(child.task.id);
          validChildren++;
        }
      }
      
      return validChildren > 0 ? totalProgress / validChildren : 0;
    },
    
    recalculateAllProgress: () => {
      const state = get();
      const projectTree = state.projectTree;
      if (!projectTree) return;
      
      const progressByTaskId = new Map<string, number>();
      
      // Calculate progress for all tasks
      projectTree.walkDepthFirst((node) => {
        progressByTaskId.set(node.task.id, state.calculateProgress(node.task.id));
      });
      
      // Update project progress
      const projects = state.projects.map((project) => ({
        ...project,
        progress: progressByTaskId.get(project.rootTaskId) || 0
      }));
      
      set({ progressByTaskId, projects });
    }
  }));

  return useStore;
}

// Helper functions - no longer needed since TaskTree has hasChildren()
// function hasChildren(taskId: string, allTasks: Task[]): boolean {
//   return allTasks.some((t) => t.parentId === taskId);
// }

// function getChildren(taskId: string, allTasks: Task[]): Task[] {
//   return allTasks.filter((t) => t.parentId === taskId);
// } 