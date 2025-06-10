import type { ContextSlice, Task, TaskTree } from "@astrotask/core";
import {
	TASK_IDENTIFIERS,
	TrackingDependencyGraph,
	TrackingTaskTree,
	createDatabase,
} from "@astrotask/core";
import { DependencyService } from "@astrotask/core/dist/services/DependencyService.js";
// Import TaskService and DependencyService first to avoid PostgreSQL import hang
import { TaskService } from "@astrotask/core/dist/services/TaskService.js";
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

	// Context slices cache
	contextSlicesByTaskId: Map<string, ContextSlice[]>;
	loadingContextSlices: Set<string>; // Track which task IDs are currently loading

	// Status filtering state
	showCompletedTasks: boolean; // When false, hide done/archived tasks (default: true)
	statusFilterCounts: {
		total: number;
		visible: number;
		hidden: number;
	};

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
	editTaskWithEditor: (taskId: string) => Promise<void>;
	updateTaskStatus: (taskId: string, status: Task["status"]) => void;
	updateTask: (taskId: string, updates: Partial<Task>) => void;
	renameTask: (taskId: string, newTitle: string) => void;
	deleteTask: (taskId: string, cascade?: boolean) => { deletedCount: number };

	// Helper to trigger re-renders after mutations
	triggerTreeUpdate: () => void;

	// Context slice actions
	loadContextSlices: (taskId: string) => Promise<ContextSlice[]>;
	getContextSlices: (taskId: string) => ContextSlice[];
	getComplexityValue: (taskId: string) => number | null;
	isLoadingContextSlices: (taskId: string) => boolean;

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

	// Status filtering actions
	toggleShowCompletedTasks: () => void;
	setShowCompletedTasks: (show: boolean) => void;
	updateStatusFilterCounts: () => void;

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

	// New method for processing pending task edit data from the editor
	processPendingTaskEdit: (
		taskEditData: import("../services/editor.js").PendingTaskEditData,
	) => Promise<void>;

	// Get relationship of a task to the currently selected task for visual highlighting
	getTaskRelationshipToSelected: (taskId: string) => string;
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
		contextSlicesByTaskId: new Map(),
		loadingContextSlices: new Set(),
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
		showCompletedTasks: true,
		statusFilterCounts: { total: 0, visible: 0, hidden: 0 },

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

				// Update status filter counts
				get().updateStatusFilterCounts();

				// Enable auto-flush for automatic saving
				get().enableAutoFlush();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({
					statusMessage: errorMessage,
					treeVersion: get().treeVersion + 1,
				});
			}
		},

		selectTask: (taskId) => {
			const previousTaskId = get().selectedTaskId;
			set({ selectedTaskId: taskId });

			// Automatically load context slices for the selected task if not already loaded or loading
			if (taskId && taskId !== previousTaskId) {
				const { contextSlicesByTaskId, loadingContextSlices } = get();
				if (
					!contextSlicesByTaskId.has(taskId) &&
					!loadingContextSlices.has(taskId)
				) {
					// Load context slices asynchronously without blocking
					get()
						.loadContextSlices(taskId)
						.catch((error) => {
							console.error(
								"Failed to load context slices for task:",
								taskId,
								error,
							);
							// Remove from loading state on error to allow retry
							const finalLoadingSet = new Set(get().loadingContextSlices);
							finalLoadingSet.delete(taskId);
							set({ loadingContextSlices: finalLoadingSet });
						});
				}
			}
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

		// Task CRUD - immediate tracking tree updates with mutable operations
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
					parentId: parentId || TASK_IDENTIFIERS.PROJECT_ROOT,
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

				// Trigger UI update immediately (optimistic update)
				get().triggerTreeUpdate();
				get().updateUnsavedChangesFlag();
				get().recalculateAllProgress();

				set({ statusMessage: `Added task: ${title}` });

				// Enable auto-flush if not already enabled
				// This will save changes automatically after a short delay
				if (!get().autoFlushEnabled) {
					get().enableAutoFlush();
				}
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

		editTaskWithEditor: async (taskId: string) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			try {
				// Set editor active flag to prevent rendering
				set({
					editorActive: true,
					statusMessage: "Opening editor for task editing...",
				});

				// Get task if taskId is provided
				const taskNode = trackingTree.find((task) => task.id === taskId);
				if (!taskNode) {
					set({
						statusMessage: `Task ${taskId} not found`,
						editorActive: false,
					});
					return;
				}

				// Open editor with task data for editing
				await editorService.openEditorForTaskEdit(taskNode.task);

				// Note: At this point, the screen has been recreated and this context is lost
				// The task edit data is stored in the EditorService and will be processed
				// when the dashboard reinitializes
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({
					statusMessage: `Error editing task: ${errorMessage}`,
					editorActive: false,
				});
			}
		},

		updateTaskStatus: (taskId, status) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			// Find the task anywhere in the tree
			const taskNode = trackingTree.find((task) => task.id === taskId);
			if (!taskNode) {
				set({ statusMessage: `Task ${taskId} not found` });
				return;
			}

			// Simple mutation - operation recorded automatically
			taskNode.withTask({ status });

			// Trigger UI update immediately (optimistic update)
			get().triggerTreeUpdate();
			get().updateUnsavedChangesFlag();
			get().recalculateAllProgress();

			set({ statusMessage: `Status updated to ${status}` });

			// Enable auto-flush if not already enabled
			// This will save changes automatically after a short delay
			if (!get().autoFlushEnabled) {
				get().enableAutoFlush();
			}
		},

		updateTask: (taskId, updates) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			// Find the task anywhere in the tree
			const taskNode = trackingTree.find((task) => task.id === taskId);
			if (!taskNode) {
				set({ statusMessage: `Task ${taskId} not found` });
				return;
			}

			// Simple mutation - operation recorded automatically
			taskNode.withTask(updates);

			// Trigger UI update immediately (optimistic update)
			get().triggerTreeUpdate();
			get().updateUnsavedChangesFlag();
			get().recalculateAllProgress();

			set({ statusMessage: `Task updated` });

			// Enable auto-flush if not already enabled
			// This will save changes automatically after a short delay
			if (!get().autoFlushEnabled) {
				get().enableAutoFlush();
			}
		},

		renameTask: (taskId, newTitle) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			// Find the task anywhere in the tree
			const taskNode = trackingTree.find((task) => task.id === taskId);
			if (!taskNode) {
				set({ statusMessage: `Task ${taskId} not found` });
				return;
			}

			// Simple mutation - operation recorded automatically
			taskNode.withTask({ title: newTitle });

			// Trigger UI update immediately (optimistic update)
			get().triggerTreeUpdate();
			get().updateUnsavedChangesFlag();
			get().recalculateAllProgress();

			set({ statusMessage: `Task renamed` });

			// Enable auto-flush if not already enabled
			// This will save changes automatically after a short delay
			if (!get().autoFlushEnabled) {
				get().enableAutoFlush();
			}
		},

		deleteTask: (taskId, cascade = false) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return { deletedCount: 0 };
			}

			// Find the task anywhere in the tree
			const taskNode = trackingTree.find((task) => task.id === taskId);
			if (!taskNode) {
				set({ statusMessage: `Task ${taskId} not found` });
				return { deletedCount: 0 };
			}

			const parent = taskNode.getParent();

			if (trackingTree.id === taskId) {
				// Deleting root - handle specially
				set({ statusMessage: "Cannot delete root task" });
				return { deletedCount: 0 };
			}

			let deletedCount = 1; // Count the main task being deleted

			if (cascade) {
				// Get all descendants before deletion
				const descendants = taskNode.getAllDescendants();
				deletedCount += descendants.length;

				// Remove each descendant individually (mutations recorded automatically)
				for (const descendant of descendants) {
					const descendantParent = descendant.getParent();
					if (descendantParent) {
						descendantParent.removeChild(descendant.id);
					}
				}
			}

			// Remove the main task
			if (parent) {
				parent.removeChild(taskId); // Mutation recorded automatically
			}

			// Trigger UI update immediately (optimistic update)
			get().triggerTreeUpdate();
			get().updateUnsavedChangesFlag();

			const message = cascade && deletedCount > 1
				? `Deleted task and ${deletedCount - 1} children (${deletedCount} total)`
				: "Task deleted";
			
			set({ statusMessage: message });

			// Enable auto-flush if not already enabled
			// This will save changes automatically after a short delay
			if (!get().autoFlushEnabled) {
				get().enableAutoFlush();
			}

			return { deletedCount };
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

		enableAutoFlush: (intervalMs = 2000) => {
			// Reduced from 5s to 2s for more responsive saves
			const state = get();
			if (state.autoFlushEnabled) return;

			autoFlushInterval = setInterval(async () => {
				const currentState = get();
				if (currentState.hasUnsavedChanges && !currentState.isFlushingChanges) {
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

				// Enable auto-flush if not already enabled
				// This will save changes automatically after a short delay
				if (!get().autoFlushEnabled) {
					get().enableAutoFlush();
				}
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

				// Enable auto-flush if not already enabled
				// This will save changes automatically after a short delay
				if (!get().autoFlushEnabled) {
					get().enableAutoFlush();
				}
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

		// Status filtering actions
		toggleShowCompletedTasks: () => {
			set((state) => ({ showCompletedTasks: !state.showCompletedTasks }));
			get().updateStatusFilterCounts();
			get().triggerTreeUpdate();
		},

		setShowCompletedTasks: (show) => {
			set({ showCompletedTasks: show });
			get().updateStatusFilterCounts();
			get().triggerTreeUpdate();
		},

		updateStatusFilterCounts: () => {
			const { trackingTree, showCompletedTasks } = get();
			if (!trackingTree) {
				set({
					statusFilterCounts: { total: 0, visible: 0, hidden: 0 },
				});
				return;
			}

			let totalCount = 0;
			let visibleCount = 0;

			trackingTree.walkDepthFirst((node) => {
				totalCount++;

				// A task is visible if we're showing completed tasks OR the task is not completed
				const isCompleted =
					node.task.status === "done" || node.task.status === "archived";
				const isVisible = showCompletedTasks || !isCompleted;

				if (isVisible) {
					visibleCount++;
				}
			});

			const hiddenCount = totalCount - visibleCount;

			set({
				statusFilterCounts: {
					total: totalCount,
					visible: visibleCount,
					hidden: hiddenCount,
				},
			});
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

			// Calculate progress bottom-up to avoid redundant recursive calls
			// First pass: calculate leaf node progress
			trackingTree.walkDepthFirst((node) => {
				const children = node.getChildren();
				if (children.length === 0) {
					// Leaf node
					const progress = node.task.status === "done" ? 100 : 0;
					progressByTaskId.set(node.task.id, progress);
				}
			});

			// Second pass: calculate parent progress from children (post-order traversal)
			const visited = new Set<string>();
			const calculateParentProgress = (node: any): number => {
				if (visited.has(node.task.id)) {
					return progressByTaskId.get(node.task.id) || 0;
				}
				visited.add(node.task.id);

				const children = node.getChildren();
				if (children.length === 0) {
					// Already calculated in first pass
					return progressByTaskId.get(node.task.id) || 0;
				}

				// Calculate based on children
				let totalProgress = 0;
				let validChildren = 0;

				for (const child of children) {
					if (
						child.task.status !== "cancelled" &&
						child.task.status !== "archived"
					) {
						totalProgress += calculateParentProgress(child);
						validChildren++;
					}
				}

				const progress = validChildren > 0 ? totalProgress / validChildren : 0;
				progressByTaskId.set(node.task.id, progress);
				return progress;
			};

			// Calculate progress for all parent nodes
			trackingTree.walkDepthFirst((node) => {
				if (node.getChildren().length > 0) {
					calculateParentProgress(node);
				}
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
				// Don't show loading message if we're just syncing in background
				const isSilentReload = get().statusMessage?.includes("Finalizing");
				if (!isSilentReload) {
					set({ statusMessage: "Reloading from database..." });
				}

				// Remember current selection and expanded state
				const currentState = get();
				const previousSelectedTaskId = currentState.selectedTaskId;
				const previousExpandedTaskIds = new Set(currentState.expandedTaskIds);

				// First flush any pending changes
				if (get().hasUnsavedChanges) {
					await get().flushChanges();
				}

				// Then reload fresh data
				await get().loadTasks();

				// Restore UI state
				const newState = get();
				if (previousSelectedTaskId && newState.trackingTree) {
					// For temporary IDs, try to find the task by title
					let taskToSelect: string | null = previousSelectedTaskId;

					if (previousSelectedTaskId.startsWith("temp-")) {
						// Find the newly created task by matching other properties
						const oldTask = currentState.trackingTree?.find(
							(task) => task.id === previousSelectedTaskId,
						);
						if (oldTask) {
							// Find by title and parent
							const newTask = newState.trackingTree.find(
								(task) =>
									task.title === oldTask.task.title &&
									task.parentId === oldTask.task.parentId &&
									!task.id.startsWith("temp-"),
							);
							if (newTask) {
								taskToSelect = newTask.task.id;
							}
						}
					}

					// Check if the task still exists
					const taskStillExists = newState.trackingTree.find(
						(task) => task.id === taskToSelect,
					);
					if (taskStillExists) {
						newState.selectTask(taskToSelect);
					}
				}

				// Restore expanded state for tasks that still exist
				const restoredExpandedTaskIds = new Set<string>();
				if (newState.trackingTree) {
					previousExpandedTaskIds.forEach((taskId) => {
						// Handle temporary IDs
						if (taskId.startsWith("temp-")) {
							// Skip temp IDs in expansion restoration
							return;
						}

						const taskStillExists = newState.trackingTree!.find(
							(task) => task.id === taskId,
						);
						if (taskStillExists) {
							restoredExpandedTaskIds.add(taskId);
						}
					});
				}
				set({ expandedTaskIds: restoredExpandedTaskIds });

				// Don't override status message if it was set to something specific
				if (!isSilentReload) {
					set({ statusMessage: "Ready" });
				}
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

				// Show immediate feedback
				set({
					statusMessage: `Creating task: ${taskTemplate.title}...`,
					editorActive: false,
				});

				// Remember the currently selected task to restore it after creation
				const previousSelectedTaskId = get().selectedTaskId;

				// Create new task with all the details from the template
				const newTask: Task = {
					id: `temp-${Date.now()}`, // Temporary ID - will be replaced on flush
					parentId: parentId || TASK_IDENTIFIERS.PROJECT_ROOT,
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
						set({
							statusMessage: `Parent task ${parentId} not found`,
						});
						return;
					}
				} else {
					// Add as root child - mutable operation
					const childTree = TrackingTaskTree.fromTask(newTask);
					trackingTree.addChild(childTree); // Mutation recorded automatically
				}

				// Trigger UI update immediately to show the task
				get().triggerTreeUpdate();
				get().updateUnsavedChangesFlag();
				get().recalculateAllProgress();

				// Show immediate feedback but don't change selection
				set({
					statusMessage: `Saving task: ${taskTemplate.title}...`,
				});

				// Flush immediately to persist the task
				try {
					await get().flushChangesImmediate();
				} catch (flushError) {
					set({
						statusMessage: `Error saving task: ${flushError instanceof Error ? flushError.message : String(flushError)}`,
					});
					return;
				}

				// Instead of full reload, just update the tracking tree with real IDs
				// This avoids the expensive loadTasks() call with PostgreSQL
				set({
					statusMessage: `Task "${taskTemplate.title}" created successfully`,
				});

				// Restore the previous selection to maintain current tree view
				if (previousSelectedTaskId) {
					get().selectTask(previousSelectedTaskId);
				}

				// Trigger update to reflect any ID changes from flush
				get().triggerTreeUpdate();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({
					statusMessage: `Error creating task: ${errorMessage}`,
					editorActive: false,
				});
			}
		},

		// New method for processing pending task edit data from the editor
		processPendingTaskEdit: async (
			taskEditData: import("../services/editor.js").PendingTaskEditData,
		) => {
			const { trackingTree } = get();

			if (!trackingTree) {
				set({ statusMessage: "No task tree loaded" });
				return;
			}

			try {
				const { taskId, task: taskTemplate } = taskEditData;

				// Show immediate feedback
				set({
					statusMessage: `Updating task: ${taskTemplate.title}...`,
					editorActive: false,
					isFlushingChanges: true, // Prevent other operations during edit
				});

				// Find the task if taskId is provided
				const taskNode = trackingTree.find((task) => task.id === taskId);
				if (!taskNode) {
					set({
						statusMessage: `Task ${taskId} not found`,
						isFlushingChanges: false,
					});
					return;
				}

				// Convert TaskTemplate to Task updates
				const updates: Partial<Task> = {
					title: taskTemplate.title,
					description: taskTemplate.description || null,
					status: taskTemplate.status,
					priority: taskTemplate.priority,
					prd: taskTemplate.details || null, // Store detailed notes in PRD field
					contextDigest: taskTemplate.notes || null, // Store additional notes in contextDigest
					updatedAt: new Date(),
				};

				// Apply the updates to the task
				taskNode.withTask(updates);

				// Trigger UI update immediately
				get().triggerTreeUpdate();
				get().updateUnsavedChangesFlag();
				get().recalculateAllProgress();

				// Keep the task selected
				set({
					selectedTaskId: taskId,
					statusMessage: `Saving changes...`,
				});

				// Force render to show the updates
				if (get().treeVersion) {
					set({ treeVersion: get().treeVersion + 1 });
				}

				// Small delay to ensure UI updates are visible
				await new Promise((resolve) => setTimeout(resolve, 50));

				// Flush changes - for edits, we don't need to reload since IDs don't change
				await get().flushChanges();

				set({
					statusMessage: `Task "${taskTemplate.title}" updated successfully`,
					isFlushingChanges: false,
				});
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				set({
					statusMessage: `Error editing task: ${errorMessage}`,
					editorActive: false,
					isFlushingChanges: false,
				});
			}
		},

		// Get relationship of a task to the currently selected task for visual highlighting
		getTaskRelationshipToSelected: (taskId: string) => {
			const { selectedTaskId, trackingDependencyGraph } = get();

			if (
				!selectedTaskId ||
				!trackingDependencyGraph ||
				taskId === selectedTaskId
			) {
				return "none";
			}

			// Check if this task is blocking the selected task (selected depends on this task)
			const selectedDependencies =
				trackingDependencyGraph.getDependencies(selectedTaskId);
			if (selectedDependencies.includes(taskId)) {
				// Further check if this blocking task is done or still pending
				const { trackingTree } = get();
				if (trackingTree) {
					const taskNode = trackingTree.find((task) => task.id === taskId);
					if (taskNode) {
						return taskNode.task.status === "done"
							? "blocking-completed"
							: "blocking-pending";
					}
				}
				return "blocking-pending";
			}

			// Check if this task depends on the selected task (this task is blocked by selected)
			const taskDependencies = trackingDependencyGraph.getDependencies(taskId);
			if (taskDependencies.includes(selectedTaskId)) {
				return "dependent";
			}

			// Check for indirect relationships (tasks that share dependencies)
			const selectedDeps = new Set(selectedDependencies);
			const taskDeps = new Set(taskDependencies);
			const hasSharedDependencies = [...selectedDeps].some((dep) =>
				taskDeps.has(dep),
			);
			if (hasSharedDependencies) {
				return "related";
			}

			return "none";
		},

		// Context slice actions
		loadContextSlices: async (taskId: string) => {
			const { loadingContextSlices, contextSlicesByTaskId } = get();

			// Prevent duplicate loading
			if (
				loadingContextSlices.has(taskId) ||
				contextSlicesByTaskId.has(taskId)
			) {
				return contextSlicesByTaskId.get(taskId) || [];
			}

			try {
				// Mark as loading
				const newLoadingSet = new Set(loadingContextSlices);
				newLoadingSet.add(taskId);
				set({ loadingContextSlices: newLoadingSet });

				const contextSlices = await db.listContextSlices(taskId);
				const newContextSlicesMap = new Map(contextSlicesByTaskId);
				newContextSlicesMap.set(taskId, contextSlices);

				// Update both cache and remove from loading
				const finalLoadingSet = new Set(loadingContextSlices);
				finalLoadingSet.delete(taskId);

				set({
					contextSlicesByTaskId: newContextSlicesMap,
					loadingContextSlices: finalLoadingSet,
				});

				return contextSlices;
			} catch (error) {
				// Remove from loading state on error
				const finalLoadingSet = new Set(loadingContextSlices);
				finalLoadingSet.delete(taskId);
				set({ loadingContextSlices: finalLoadingSet });

				console.error("Failed to load context slices:", error);
				return [];
			}
		},

		getContextSlices: (taskId: string) => {
			const { contextSlicesByTaskId } = get();
			return contextSlicesByTaskId.get(taskId) || [];
		},

		getComplexityValue: (taskId: string) => {
			const contextSlices = get().getContextSlices(taskId);
			const complexitySlice = contextSlices.find((slice) =>
				slice.title.toLowerCase().includes("complexity"),
			);
			if (complexitySlice && complexitySlice.description) {
				// Updated regex to match both old and new formats
				// Matches patterns like "Complexity Score: 8/10" or "complexity: 8"
				const match = complexitySlice.description.match(
					/complexity\s*(?:score\s*:)?\s*(\d+(?:\.\d+)?)/i,
				);
				return match && match[1] ? parseFloat(match[1]) : null;
			}
			return null;
		},

		isLoadingContextSlices: (taskId: string) => {
			const { loadingContextSlices } = get();
			return loadingContextSlices.has(taskId);
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
