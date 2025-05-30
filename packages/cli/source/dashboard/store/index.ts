import type { Task, TaskTree } from "@astrolabe/core";
import {
	DependencyService,
	TaskService,
	TrackingDependencyGraph,
	TrackingTaskTree,
	createDatabase,
} from "@astrolabe/core";
import type blessed from "blessed";
import { create } from "zustand";
import { EditorService, type PendingTaskData } from "../services/editor.js";

export interface DashboardState {
	// Core data structures - TrackingTaskTree and TrackingDependencyGraph as source of truth
	trackingTree: TrackingTaskTree | null;
	trackingDependencyGraph: TrackingDependencyGraph | null;
	selectedTaskId: string | null;
	expandedTaskIds: Set<string>;

	// Version counter for triggering React re-renders after mutations
	treeVersion: number;

	// UI state
	activePanel: "sidebar" | "tree" | "details";
	commandPaletteOpen: boolean;
	helpOverlayOpen: boolean;
	statusMessage: string;
	confirmExit: boolean;
	detailViewMode: "normal" | "dependencies"; // New view mode toggle
	treeViewMode: "hierarchy" | "dependencies"; // Tree view mode toggle
	editorActive: boolean; // Track if editor is active

	// Project data (derived from trackingTree.getChildren())
	projects: Project[];
	selectedProjectId: string | null;

	// Progress cache (computed from TrackingTaskTree)
	progressByTaskId: Map<string, number>;

	// Persistence state
	hasUnsavedChanges: boolean;
	lastFlushTime: number;
	autoFlushEnabled: boolean;
	isFlushingChanges: boolean;
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

	// Task CRUD - immediate tracking tree updates with mutable operations
	addTask: (parentId: string | null, title: string) => void;
	addTaskWithEditor: (parentId: string | null) => Promise<void>;
	updateTaskStatus: (taskId: string, status: Task["status"]) => void;
	updateTask: (taskId: string, updates: Partial<Task>) => void;
	renameTask: (taskId: string, newTitle: string) => void;
	deleteTask: (taskId: string) => void;

	// Helper to trigger re-renders after mutations
	triggerTreeUpdate: () => void;

	// Persistence control
	flushChanges: () => Promise<void>;
	enableAutoFlush: (intervalMs?: number) => void;
	disableAutoFlush: () => void;
	flushChangesImmediate: () => Promise<void>;
	flushOnExit: () => Promise<void>;

	// Dependency actions - now using TrackingDependencyGraph
	addDependency: (taskId: string, dependsOnId: string) => void;
	removeDependency: (taskId: string, dependsOnId: string) => void;

	// UI actions
	setActivePanel: (panel: DashboardState["activePanel"]) => void;
	toggleCommandPalette: () => void;
	toggleHelpOverlay: () => void;
	setStatusMessage: (message: string) => void;
	setConfirmExit: (confirm: boolean) => void;
	toggleDetailViewMode: () => void;
	toggleTreeViewMode: () => void;

	// Project actions
	selectProject: (projectId: string | null) => void;

	// Tree operations (using TrackingTaskTree methods)
	getTaskTree: (taskId: string) => TaskTree | null;
	getAllTasks: () => Task[];
	getProjects: () => TaskTree[];

	// Dependency queries (using TrackingDependencyGraph)
	getTaskDependencies: (taskId: string) => string[];
	getTaskDependents: (taskId: string) => string[];
	getBlockingTasks: (taskId: string) => string[];
	isTaskBlocked: (taskId: string) => boolean;

	// Progress calculation
	calculateProgress: (taskId: string) => number;
	recalculateAllProgress: () => void;

	// Sync operations
	reloadFromDatabase: () => Promise<void>;

	// Helper methods
	updateUnsavedChangesFlag: () => void;

	// New method for processing pending task data from the editor
	processPendingTask: (taskData: PendingTaskData) => Promise<void>;
}

export type DashboardStore = DashboardState & DashboardActions;

type DatabaseStore = Awaited<ReturnType<typeof createDatabase>>;

export function createDashboardStore(
	db: DatabaseStore,
	screen?: blessed.Widgets.Screen,
) {
	const taskService = new TaskService(db);
	const dependencyService = new DependencyService(db);
	const editorService = new EditorService();

	// Set screen if provided
	if (screen) {
		editorService.setScreen(screen);
	}

	let autoFlushInterval: NodeJS.Timeout | null = null;

	const useStore = create<DashboardStore>((set, get) => ({
		// Initial state
		trackingTree: null,
		trackingDependencyGraph: null,
		selectedTaskId: null,
		expandedTaskIds: new Set(),
		treeVersion: 0,
		activePanel: "tree",
		commandPaletteOpen: false,
		helpOverlayOpen: false,
		statusMessage: "Ready",
		confirmExit: false,
		detailViewMode: "normal",
		treeViewMode: "hierarchy",
		editorActive: false,
		projects: [],
		selectedProjectId: null,
		progressByTaskId: new Map(),
		hasUnsavedChanges: false,
		lastFlushTime: 0,
		autoFlushEnabled: false,
		isFlushingChanges: false,

		// Helper to trigger re-renders after mutations
		triggerTreeUpdate: () => {
			set({ treeVersion: get().treeVersion + 1 });
		},

		// Task actions
		loadTasks: async () => {
			try {
				set({ statusMessage: "Loading tasks..." });

				// Load the base TaskTree from the database
				const baseTree = await taskService.getTaskTree();

				if (!baseTree) {
					set({
						trackingTree: null,
						trackingDependencyGraph: null,
						projects: [],
						statusMessage: "No tasks found",
						hasUnsavedChanges: false,
						treeVersion: get().treeVersion + 1,
					});
					return;
				}

				// Convert to TrackingTaskTree for in-memory optimistic updates
				const trackingTree = TrackingTaskTree.fromTaskTree(baseTree);

				// Load dependency graph and convert to TrackingDependencyGraph
				const baseDependencyGraph =
					await dependencyService.createDependencyGraph();
				const trackingDependencyGraph =
					TrackingDependencyGraph.fromDependencyGraph(
						baseDependencyGraph,
						"dashboard-dependencies",
					);

				// Get projects as children of project root
				const projects: Project[] = trackingTree
					.getChildren()
					.map((projectNode) => ({
						id: projectNode.task.id,
						name: projectNode.task.title,
						rootTaskId: projectNode.task.id,
						progress: 0, // Will be calculated
					}));

				set({
					trackingTree,
					trackingDependencyGraph,
					projects,
					statusMessage: "Tasks loaded successfully",
					hasUnsavedChanges: false,
					treeVersion: get().treeVersion + 1,
				});

				// Calculate progress
				get().recalculateAllProgress();

				// Enable auto-flush by default
				get().enableAutoFlush();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({ statusMessage: `Error loading tasks: ${errorMessage}` });
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
			const trackingTree = get().trackingTree;
			if (trackingTree) {
				trackingTree.walkDepthFirst((node) => {
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

		// Task CRUD - now using mutable operations
		addTask: (parentId, title) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			try {
				// Create new task
				const newTask: Task = {
					id: `temp-${Date.now()}`, // Temporary ID - will be replaced on flush
					parentId,
					title,
					description: null,
					status: "pending",
					priority: "medium",
					prd: null,
					contextDigest: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				};

				if (parentId) {
					// Find parent and add child - mutable operation
					const parentNode = trackingTree.find((task) => task.id === parentId);
					if (parentNode) {
						const childTree = TrackingTaskTree.fromTask(newTask);
						parentNode.addChild(childTree); // Mutation recorded automatically
					} else {
						set({ statusMessage: `Parent task ${parentId} not found` });
						return;
					}
				} else {
					// Add as root child - mutable operation
					const childTree = TrackingTaskTree.fromTask(newTask);
					trackingTree.addChild(childTree); // Mutation recorded automatically
				}

				// Trigger UI update
				get().triggerTreeUpdate();
				get().updateUnsavedChangesFlag();
				get().recalculateAllProgress();

				set({ statusMessage: `Added task: ${title}` });
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({ statusMessage: `Error adding task: ${errorMessage}` });
			}
		},

		addTaskWithEditor: async (parentId: string | null) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			try {
				// Set editor active flag to prevent rendering
				set({
					editorActive: true,
					statusMessage: "Opening editor for task creation...",
				});

				// Get parent task if parentId is provided
				let parentTask: Task | undefined;
				if (parentId) {
					const parentNode = trackingTree.find((task) => task.id === parentId);
					if (!parentNode) {
						set({
							statusMessage: `Parent task ${parentId} not found`,
							editorActive: false,
						});
						return;
					}
					parentTask = parentNode.task;
				}

				// Open editor with template and pass parentId
				await editorService.openEditorForTask(parentTask, parentId);

				// Note: At this point, the screen has been recreated and this context is lost
				// The task data is stored in the EditorService and will be processed
				// when the dashboard reinitializes
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({
					statusMessage: `Error creating task: ${errorMessage}`,
					editorActive: false,
				});
			}
		},

		updateTaskStatus: (taskId, status) => {
			get().updateTask(taskId, { status });
		},

		updateTask: (taskId, updates) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			try {
				// Find the task anywhere in the tree
				const taskNode = trackingTree.find((task) => task.id === taskId);
				if (!taskNode) {
					set({ statusMessage: `Task ${taskId} not found` });
					return;
				}

				// Simple mutation - operation recorded automatically
				taskNode.withTask(updates);

				// Trigger UI update
				get().triggerTreeUpdate();
				get().updateUnsavedChangesFlag();
				get().recalculateAllProgress();

				set({ statusMessage: `Updated task ${taskId}` });
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({ statusMessage: `Error updating task: ${errorMessage}` });
			}
		},

		renameTask: (taskId, newTitle) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			try {
				// Find the task anywhere in the tree
				const taskNode = trackingTree.find((task) => task.id === taskId);
				if (!taskNode) {
					set({ statusMessage: `Task ${taskId} not found` });
					return;
				}

				// Simple mutation - operation recorded automatically
				taskNode.withTask({ title: newTitle });

				// Trigger UI update
				get().triggerTreeUpdate();
				get().updateUnsavedChangesFlag();
				get().recalculateAllProgress();

				set({ statusMessage: `Renamed task ${taskId} to ${newTitle}` });
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({ statusMessage: `Error renaming task: ${errorMessage}` });
			}
		},

		deleteTask: (taskId) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			try {
				// Find the task anywhere in the tree
				const taskNode = trackingTree.find((task) => task.id === taskId);
				if (!taskNode) {
					set({ statusMessage: `Task ${taskId} not found` });
					return;
				}

				const parent = taskNode.getParent();

				if (parent) {
					parent.removeChild(taskId); // Mutation recorded automatically
				} else if (trackingTree.id === taskId) {
					// Deleting root - handle specially
					set({ statusMessage: "Cannot delete root task" });
					return;
				}

				// Trigger UI update
				get().triggerTreeUpdate();
				get().updateUnsavedChangesFlag();

				set({ statusMessage: "Task deleted" });
			} catch (error) {
				console.error("Error in deleteTask:", error);
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({ statusMessage: `Error deleting task: ${errorMessage}` });
			}
		},

		// Persistence control - now works for ALL pending operations
		flushChanges: async () => {
			const { trackingTree, trackingDependencyGraph, isFlushingChanges } =
				get();

			// Prevent concurrent flushes
			if (isFlushingChanges) {
				set({ statusMessage: "Save already in progress..." });
				return;
			}

			if (
				!trackingTree?.hasPendingChanges &&
				!trackingDependencyGraph?.hasPendingChanges
			) {
				set({ statusMessage: "No changes to save" });
				return;
			}

			try {
				set({
					statusMessage: "Saving changes...",
					isFlushingChanges: true,
				});

				// Apply tree changes first to get ID mappings
				let treeResult: any = null;
				let dependencyResult: any = null;

				if (trackingTree && trackingTree.hasPendingChanges) {
					treeResult = await trackingTree.flush(taskService);
				}

				// Apply dependency changes, using ID mappings if available
				if (
					trackingDependencyGraph &&
					trackingDependencyGraph.hasPendingChanges
				) {
					let graphToFlush = trackingDependencyGraph;

					// If we have ID mappings from the tree flush, apply them to the dependency graph
					if (
						treeResult &&
						treeResult.idMappings &&
						treeResult.idMappings.size > 0
					) {
						graphToFlush = trackingDependencyGraph.applyIdMappings(
							treeResult.idMappings,
						);
					}

					dependencyResult = await graphToFlush.flush(dependencyService);
				}

				// Update state with results and handle ID mappings
				const currentState = get();
				let updateData: any = {
					statusMessage: "Changes saved successfully",
					hasUnsavedChanges: false,
					lastFlushTime: Date.now(),
					treeVersion: currentState.treeVersion + 1,
					isFlushingChanges: false,
				};

				// Update tracking tree
				if (treeResult) {
					updateData.trackingTree = treeResult.clearedTrackingTree;

					// Update any UI references that might be using temporary IDs
					if (treeResult.idMappings && treeResult.idMappings.size > 0) {
						// Update selectedTaskId if it was a temporary ID
						if (
							currentState.selectedTaskId &&
							treeResult.idMappings.has(currentState.selectedTaskId)
						) {
							updateData.selectedTaskId = treeResult.idMappings.get(
								currentState.selectedTaskId,
							);
						}

						// Update expandedTaskIds if they contain temporary IDs
						const newExpandedTaskIds = new Set<string>();
						for (const taskId of currentState.expandedTaskIds) {
							const newId = treeResult.idMappings.get(taskId) || taskId;
							newExpandedTaskIds.add(newId);
						}
						updateData.expandedTaskIds = newExpandedTaskIds;
					}
				}

				// Update tracking dependency graph
				if (dependencyResult) {
					updateData.trackingDependencyGraph =
						dependencyResult.clearedTrackingGraph;
				}

				set(updateData);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({
					statusMessage: `Error saving: ${errorMessage}`,
					isFlushingChanges: false,
				});
				throw error; // Re-throw for callers that need to handle it
			}
		},

		flushChangesImmediate: async () => {
			// Immediate flush without debouncing or auto-flush interference
			const { isFlushingChanges } = get();

			if (isFlushingChanges) {
				// Wait for current flush to complete
				while (get().isFlushingChanges) {
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				return;
			}

			await get().flushChanges();
		},

		flushOnExit: async () => {
			try {
				// Disable auto-flush to prevent interference
				get().disableAutoFlush();

				// Force immediate flush
				await get().flushChangesImmediate();

				set({ statusMessage: "All changes saved before exit" });
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({ statusMessage: `Failed to save before exit: ${errorMessage}` });
				throw error;
			}
		},

		enableAutoFlush: (intervalMs = 5000) => {
			// Reduced from 10s to 5s for faster saves
			const state = get();
			if (state.autoFlushEnabled) return;

			autoFlushInterval = setInterval(async () => {
				const currentState = get();
				if (currentState.hasUnsavedChanges) {
					await currentState.flushChanges();
				}
			}, intervalMs);

			set({ autoFlushEnabled: true });
		},

		disableAutoFlush: () => {
			if (autoFlushInterval) {
				clearInterval(autoFlushInterval);
				autoFlushInterval = null;
			}
			set({ autoFlushEnabled: false });
		},

		// Dependency actions - using TrackingDependencyGraph operations
		addDependency: (taskId, dependsOnId) => {
			const { trackingDependencyGraph } = get();

			if (!trackingDependencyGraph) {
				set({ statusMessage: "No dependency graph loaded" });
				return;
			}

			try {
				// TrackingDependencyGraph uses immutable operations, so we need to update the store
				const updatedGraph = trackingDependencyGraph.withDependency(
					taskId,
					dependsOnId,
				);

				set({
					trackingDependencyGraph: updatedGraph,
					statusMessage: "Dependency added",
				});

				get().updateUnsavedChangesFlag();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({ statusMessage: `Error adding dependency: ${errorMessage}` });
			}
		},

		removeDependency: (taskId, dependsOnId) => {
			const { trackingDependencyGraph } = get();

			if (!trackingDependencyGraph) {
				set({ statusMessage: "No dependency graph loaded" });
				return;
			}

			try {
				// TrackingDependencyGraph uses immutable operations, so we need to update the store
				const updatedGraph = trackingDependencyGraph.withoutDependency(
					taskId,
					dependsOnId,
				);

				set({
					trackingDependencyGraph: updatedGraph,
					statusMessage: "Dependency removed",
				});

				get().updateUnsavedChangesFlag();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({ statusMessage: `Error removing dependency: ${errorMessage}` });
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

		toggleDetailViewMode: () => {
			set((state) => ({
				detailViewMode:
					state.detailViewMode === "normal" ? "dependencies" : "normal",
			}));
		},

		toggleTreeViewMode: () => {
			set((state) => ({
				treeViewMode:
					state.treeViewMode === "hierarchy" ? "dependencies" : "hierarchy",
			}));
		},

		// Project actions
		selectProject: (projectId) => {
			set({ selectedProjectId: projectId });
		},

		// Tree operations (using TrackingTaskTree methods)
		getTaskTree: (taskId: string) => {
			const trackingTree = get().trackingTree;
			if (!trackingTree) return null;
			const node = trackingTree.find((task) => task.id === taskId);
			return node ? node.toTaskTree() : null;
		},

		getAllTasks: () => {
			const trackingTree = get().trackingTree;
			if (!trackingTree) return [];
			const tasks: Task[] = [];
			trackingTree.walkDepthFirst((node) => {
				tasks.push(node.task);
			});
			return tasks;
		},

		getProjects: () => {
			const trackingTree = get().trackingTree;
			if (!trackingTree) return [];
			return trackingTree.getChildren().map((child) => child.toTaskTree());
		},

		// Dependency queries (using TrackingDependencyGraph)
		getTaskDependencies: (taskId: string) => {
			const trackingDependencyGraph = get().trackingDependencyGraph;
			if (!trackingDependencyGraph) return [];
			return trackingDependencyGraph.getDependencies(taskId);
		},

		getTaskDependents: (taskId: string) => {
			const trackingDependencyGraph = get().trackingDependencyGraph;
			if (!trackingDependencyGraph) return [];
			return trackingDependencyGraph.getDependents(taskId);
		},

		getBlockingTasks: (taskId: string) => {
			const trackingDependencyGraph = get().trackingDependencyGraph;
			if (!trackingDependencyGraph) return [];
			return trackingDependencyGraph.getTaskDependencyGraph(taskId).blockedBy;
		},

		isTaskBlocked: (taskId: string) => {
			const trackingDependencyGraph = get().trackingDependencyGraph;
			if (!trackingDependencyGraph) return false;
			return trackingDependencyGraph.getTaskDependencyGraph(taskId).isBlocked;
		},

		// Progress calculation (using TrackingTaskTree structure)
		calculateProgress: (taskId: string) => {
			const trackingTree = get().trackingTree;
			if (!trackingTree) return 0;

			const taskNode = trackingTree.find((task) => task.id === taskId);
			if (!taskNode) return 0;

			const children = taskNode.getChildren();
			if (children.length === 0) {
				// Leaf node
				return taskNode.task.status === "done" ? 100 : 0;
			}

			// Calculate based on children using TrackingTaskTree traversal
			let totalProgress = 0;
			let validChildren = 0;

			for (const child of children) {
				if (
					child.task.status !== "cancelled" &&
					child.task.status !== "archived"
				) {
					totalProgress += get().calculateProgress(child.task.id);
					validChildren++;
				}
			}

			return validChildren > 0 ? totalProgress / validChildren : 0;
		},

		recalculateAllProgress: () => {
			const trackingTree = get().trackingTree;
			if (!trackingTree) return;

			const progressByTaskId = new Map<string, number>();

			// Calculate progress for all tasks using TrackingTaskTree traversal
			trackingTree.walkDepthFirst((node) => {
				progressByTaskId.set(
					node.task.id,
					get().calculateProgress(node.task.id),
				);
			});

			// Update project progress
			const projects = get().projects.map((project) => ({
				...project,
				progress: progressByTaskId.get(project.rootTaskId) || 0,
			}));

			set({ progressByTaskId, projects });
		},

		// Sync operations
		reloadFromDatabase: async () => {
			try {
				set({ statusMessage: "Reloading from database..." });

				// First flush any pending changes
				if (get().hasUnsavedChanges) {
					await get().flushChanges();
				}

				// Then reload fresh data
				await get().loadTasks();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({ statusMessage: `Error reloading: ${errorMessage}` });
			}
		},

		// Helper methods
		updateUnsavedChangesFlag: () => {
			const { trackingTree, trackingDependencyGraph } = get();
			const hasUnsavedChanges = Boolean(
				trackingTree?.hasPendingChanges ||
					trackingDependencyGraph?.hasPendingChanges,
			);
			set({ hasUnsavedChanges });
		},

		// New method for processing pending task data from the editor
		processPendingTask: async (taskData: PendingTaskData) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			try {
				const { task: taskTemplate, parentId } = taskData;

				// Create new task with all the details from the template
				const newTask: Task = {
					id: `temp-${Date.now()}`, // Temporary ID - will be replaced on flush
					parentId,
					title: taskTemplate.title,
					description: taskTemplate.description || null,
					status: taskTemplate.status,
					priority: taskTemplate.priority,
					prd: taskTemplate.details || null, // Store detailed notes in PRD field
					contextDigest: taskTemplate.notes || null, // Store additional notes in contextDigest
					createdAt: new Date(),
					updatedAt: new Date(),
				};

				if (parentId) {
					// Find parent and add child - mutable operation
					const parentNode = trackingTree.find((task) => task.id === parentId);
					if (parentNode) {
						const childTree = TrackingTaskTree.fromTask(newTask);
						parentNode.addChild(childTree); // Mutation recorded automatically
					} else {
						set({ statusMessage: `Parent task ${parentId} not found` });
						return;
					}
				} else {
					// Add as root child - mutable operation
					const childTree = TrackingTaskTree.fromTask(newTask);
					trackingTree.addChild(childTree); // Mutation recorded automatically
				}

				// Trigger UI update
				get().triggerTreeUpdate();
				get().updateUnsavedChangesFlag();
				get().recalculateAllProgress();

				set({
					statusMessage: `Created task: ${taskTemplate.title}`,
					editorActive: false,
				});

				// Immediately flush to get real ID and avoid temporary ID issues
				try {
					await get().flushChanges();
					set({
						statusMessage: `Task "${taskTemplate.title}" saved successfully`,
					});
				} catch (flushError) {
					console.error("Failed to flush task after creation:", flushError);
					// Don't overwrite the success message with an error - the task was created,
					// it just wasn't immediately persisted
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({
					statusMessage: `Error creating task: ${errorMessage}`,
					editorActive: false,
				});
			}
		},
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
