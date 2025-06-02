import type { Task, TaskDependency } from "@astrotask/core";
import { create } from "zustand";

export interface AppState {
	// Task data
	tasks: Task[];
	dependencies: TaskDependency[];

	// UI state
	selectedTaskId: string | null;
	expandedTaskIds: Set<string>;
	currentView: "tree" | "dependencies" | "help";
	showCommandPalette: boolean;
	commandPaletteInput: string;

	// Enhanced scroll state
	scrollOffset: number;
	scrollMode: "auto" | "manual"; // Track if user is manually scrolling
	lastManualScrollTime: number; // Timestamp of last manual scroll
	viewportHeight: number; // Current viewport height
	totalContentHeight: number; // Total content height

	// Progress tracking
	progressByTask: Map<string, number>;
	dirtyProgressTasks: Set<string>;

	// Indices for performance
	childrenByParent: Map<string, string[]>;
	depsByTask: Map<string, string[]>;

	// Actions
	setTasks: (tasks: Task[]) => void;
	setDependencies: (dependencies: TaskDependency[]) => void;
	selectTask: (taskId: string | null) => void;
	toggleTaskExpanded: (taskId: string) => void;
	setCurrentView: (view: "tree" | "dependencies" | "help") => void;
	toggleCommandPalette: () => void;
	setCommandPaletteInput: (input: string) => void;
	setScrollOffset: (offset: number, mode?: "auto" | "manual") => void;
	setViewportDimensions: (height: number, contentHeight: number) => void;
	updateProgress: (taskId: string, progress: number) => void;
	markProgressDirty: (taskId: string) => void;
	clearDirtyProgress: () => void;
	rebuildIndices: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
	// Initial state
	tasks: [],
	dependencies: [],
	selectedTaskId: null,
	expandedTaskIds: new Set(),
	currentView: "tree",
	showCommandPalette: false,
	commandPaletteInput: "",
	scrollOffset: 0,
	scrollMode: "auto",
	lastManualScrollTime: 0,
	viewportHeight: 0,
	totalContentHeight: 0,
	progressByTask: new Map(),
	dirtyProgressTasks: new Set(),
	childrenByParent: new Map(),
	depsByTask: new Map(),

	// Actions
	setTasks: (tasks) => {
		set({ tasks });
		get().rebuildIndices();
	},

	setDependencies: (dependencies) => {
		set({ dependencies });
		get().rebuildIndices();
	},

	selectTask: (taskId) => set({ selectedTaskId: taskId }),

	toggleTaskExpanded: (taskId) => {
		const { expandedTaskIds } = get();
		const newExpanded = new Set(expandedTaskIds);
		if (newExpanded.has(taskId)) {
			newExpanded.delete(taskId);
		} else {
			newExpanded.add(taskId);
		}
		set({ expandedTaskIds: newExpanded });
	},

	setCurrentView: (view) => set({ currentView: view }),

	toggleCommandPalette: () => {
		const { showCommandPalette } = get();
		set({
			showCommandPalette: !showCommandPalette,
			commandPaletteInput: showCommandPalette ? "" : get().commandPaletteInput,
		});
	},

	setCommandPaletteInput: (input) => set({ commandPaletteInput: input }),

	setScrollOffset: (offset, mode = "auto") => {
		const updates: Partial<AppState> = { scrollOffset: offset };
		if (mode) {
			updates.scrollMode = mode;
			if (mode === "manual") {
				updates.lastManualScrollTime = Date.now();
			}
		}
		set(updates);
	},

	setViewportDimensions: (height, contentHeight) =>
		set({ viewportHeight: height, totalContentHeight: contentHeight }),

	updateProgress: (taskId, progress) => {
		const { progressByTask } = get();
		const newProgress = new Map(progressByTask);
		newProgress.set(taskId, progress);
		set({ progressByTask: newProgress });
	},

	markProgressDirty: (taskId) => {
		const { dirtyProgressTasks } = get();
		const newDirty = new Set(dirtyProgressTasks);
		newDirty.add(taskId);
		set({ dirtyProgressTasks: newDirty });
	},

	clearDirtyProgress: () => set({ dirtyProgressTasks: new Set() }),

	rebuildIndices: () => {
		const { tasks, dependencies } = get();

		// Build children index
		const childrenByParent = new Map<string, string[]>();
		for (const task of tasks) {
			if (task.parentId) {
				const children = childrenByParent.get(task.parentId) || [];
				children.push(task.id);
				childrenByParent.set(task.parentId, children);
			}
		}

		// Build dependencies index
		const depsByTask = new Map<string, string[]>();
		for (const dep of dependencies) {
			const deps = depsByTask.get(dep.dependentTaskId) || [];
			deps.push(dep.dependencyTaskId);
			depsByTask.set(dep.dependentTaskId, deps);
		}

		set({ childrenByParent, depsByTask });
	},
}));

// Selectors
export const useTaskById = (taskId: string | null) => {
	return useAppStore((state) =>
		taskId ? state.tasks.find((t) => t.id === taskId) : null,
	);
};

export const useChildTasks = (parentId: string | null) => {
	return useAppStore((state) => {
		if (!parentId) {
			return state.tasks.filter((t) => !t.parentId);
		}
		const childIds = state.childrenByParent.get(parentId) || [];
		return childIds
			.map((id) => state.tasks.find((t) => t.id === id))
			.filter(Boolean) as Task[];
	});
};

export const useTaskDependencies = (taskId: string) => {
	return useAppStore((state) => {
		const depIds = state.depsByTask.get(taskId) || [];
		return depIds
			.map((id) => state.tasks.find((t) => t.id === id))
			.filter(Boolean) as Task[];
	});
};

export const useTaskProgress = (taskId: string) => {
	return useAppStore((state) => state.progressByTask.get(taskId) || 0);
};
