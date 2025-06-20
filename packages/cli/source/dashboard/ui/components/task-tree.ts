import type { Task, TaskTree, TrackingTaskTree } from "@astrotask/core";
import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";
import {
	ColorIntegrationSystem,
	type DependencyRelationship,
} from "../../utils/color-integration.js";
import { StatusRenderer } from "../../utils/status-renderer.js";
import {
	TaskLineFormatter,
	type TaskLineInfo,
} from "../../utils/task-line-formatter.js";

interface TaskTreeItem {
	taskId: string;
	label: string;
	depth: number;
	isExpanded: boolean;
	hasChildren: boolean;
	task: Task;
	index: number; // Add index for line numbering
}

export class TaskTreeComponent {
	private list: blessed.Widgets.ListElement;
	private unsubscribe: () => void;
	private lastKeyPress: number = 0;
	private keyDebounceMs: number = 150;
	private isRendering: boolean = false;
	private currentItems: TaskTreeItem[] = [];
	private statusRenderer: StatusRenderer;
	private taskLineFormatter: TaskLineFormatter;
	private colorIntegration: ColorIntegrationSystem;

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		// Initialize the enhanced status renderer
		this.statusRenderer = StatusRenderer.create();

		// Initialize the task line formatter
		this.taskLineFormatter = TaskLineFormatter.create({
			statusRenderer: this.statusRenderer,
		});

		// Initialize the color integration system
		this.colorIntegration = ColorIntegrationSystem.createBackgroundOnly();

		// Create the list widget with proper blessed configuration
		this.list = blessed.list({
			parent: this.parent,
			label: " Task Tree ",
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "cyan",
				},
				selected: {
					bg: "blue",
					fg: "black",
					bold: true,
				},
				focus: {
					border: {
						fg: "yellow",
					},
				},
				item: {
					hover: {
						bg: "gray",
					},
				},
			},
			keys: true,
			vi: true,
			mouse: true,
			scrollable: true,
			interactive: true,
			focusable: true,
			tags: true,
			scrollbar: {
				ch: " ",
				track: {
					bg: "gray",
				},
				style: {
					inverse: true,
				},
			},
			alwaysScroll: true,
			invertSelected: false,
		});

		this.setupEventHandlers();

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			// Skip rendering if editor is active
			if (!state.editorActive) {
				this.render(state);
			}
		});

		// Initial render
		this.render(this.store.getState());
	}

	destroy() {
		this.unsubscribe();
	}

	focus() {
		this.list.focus();
	}

	setPosition(position: blessed.Widgets.Position) {
		Object.assign(this.list, position);
	}

	private setupEventHandlers() {
		const state = () => this.store.getState();

		// Remove redundant navigation - blessed handles this automatically with keys: true
		// this.list.key(["up", "k"], () => {
		//   this.list.up(1);
		// });
		//
		// this.list.key(["down", "j"], () => {
		//   this.list.down(1);
		// });

		// Expand/collapse handling
		this.list.key(["right", "l"], () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item && item.hasChildren) {
				state().toggleTaskExpanded(item.taskId);
			}
		});

		this.list.key(["left", "h"], () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item && state().expandedTaskIds.has(item.taskId)) {
				state().toggleTaskExpanded(item.taskId);
			}
		});

		// Enter to expand/collapse or toggle status
		this.list.key(["enter"], () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				// New behavior: Cycle through status: pending -> in-progress -> done -> pending
				if (item.task.status === "pending") {
					state().updateTaskStatus(item.taskId, "in-progress");
					state().setStatusMessage(`Started: ${item.task.title}`);
				} else if (item.task.status === "in-progress") {
					state().updateTaskStatus(item.taskId, "done");
					state().setStatusMessage(`Completed: ${item.task.title} ✓`);
				} else if (item.task.status === "done") {
					state().updateTaskStatus(item.taskId, "pending");
					state().setStatusMessage(`Reopened: ${item.task.title}`);
				} else {
					// For other statuses (blocked, cancelled, archived), expand/collapse if has children
					if (item.hasChildren) {
						state().toggleTaskExpanded(item.taskId);
					}
					state().selectTask(item.taskId);

					// Show helpful message about dependency highlighting
					const currentState = state();
					const dependencies = currentState.getTaskDependencies(item.taskId);
					const dependents = currentState.getTaskDependents(item.taskId);

					if (dependencies.length > 0 || dependents.length > 0) {
						state().setStatusMessage(
							`Selected: ${item.task.title} | Dependency highlighting active - ⚠ blocking pending, ✓ blocking done, ← dependent, ~ related`,
						);
					} else {
						state().setStatusMessage(`Selected: ${item.task.title}`);
					}
				}
			}
		});

		// Space to also toggle status (same as Enter for consistency)
		this.list.key(["space"], async () => {
			const now = Date.now();
			if (now - this.lastKeyPress < this.keyDebounceMs) return;
			this.lastKeyPress = now;

			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				// New behavior: Cycle through status: pending -> in-progress -> done -> pending
				if (item.task.status === "pending") {
					state().updateTaskStatus(item.taskId, "in-progress");
					state().setStatusMessage(`Started: ${item.task.title}`);
				} else if (item.task.status === "in-progress") {
					state().updateTaskStatus(item.taskId, "done");
					state().setStatusMessage(`Completed: ${item.task.title} ✓`);
				} else if (item.task.status === "done") {
					state().updateTaskStatus(item.taskId, "pending");
					state().setStatusMessage(`Reopened: ${item.task.title}`);
				} else {
					// For other statuses, show a message
					state().setStatusMessage(
						`Cannot toggle - task is ${item.task.status}. Use Enter/Space to cycle status, or b to block/unblock.`,
					);
				}
			}
		});

		// Shift+D to mark done
		this.list.key(["S-d"], async () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				// Only allow marking done from pending or in-progress
				if (
					item.task.status === "pending" ||
					item.task.status === "in-progress" ||
					item.task.status === "blocked"
				) {
					state().updateTaskStatus(item.taskId, "done");
					state().setStatusMessage(`Completed: ${item.task.title} ✓`);
				} else if (item.task.status === "done") {
					// Allow reopening completed tasks
					state().updateTaskStatus(item.taskId, "in-progress");
					state().setStatusMessage(`Reopened: ${item.task.title}`);
				} else {
					state().setStatusMessage(
						`Cannot mark done - task is ${item.task.status}`,
					);
				}
			}
		});

		// b/B to block/unblock tasks
		this.list.key(["b", "S-b"], async () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				if (item.task.status === "blocked") {
					// Unblock: restore to in-progress (could be enhanced later to remember previous state)
					state().updateTaskStatus(item.taskId, "in-progress");
					state().setStatusMessage(
						`Unblocked: ${item.task.title} - resumed as in-progress`,
					);
				} else if (
					item.task.status === "pending" ||
					item.task.status === "in-progress"
				) {
					// Block the task
					state().updateTaskStatus(item.taskId, "blocked");
					state().setStatusMessage(`Blocked: ${item.task.title} ⛔`);
				} else {
					state().setStatusMessage(
						`Cannot block/unblock - task is ${item.task.status}`,
					);
				}
			}
		});

		// Add sibling task
		this.list.key(["a"], async () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				const taskTree = state().getTaskTree(item.taskId);
				const parentId = taskTree?.getParent()?.task.id || null;
				await state().addTaskWithEditor(parentId);
			}
		});

		// Add child task
		this.list.key(["S-a"], async () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				await state().addTaskWithEditor(item.taskId);
			}
		});

		// Delete task - using multiple key bindings for better compatibility
		this.list.key(["delete", "C-d", "x"], () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];

			if (item) {
				// Show immediate status feedback
				state().setStatusMessage(`Deleting task: ${item.task.title}...`);

				this.confirmDelete(item.task, (cascade) => {
					try {
						state().deleteTask(item.taskId, cascade);
						// Status message is already set by deleteTask, no need to override
					} catch (error) {
						console.error("Error in deleteTask:", error);
						state().setStatusMessage(`Error deleting task: ${error}`);
					}
				});
			} else {
				state().setStatusMessage("No task selected for deletion");
			}
		});

		// Rename task
		this.list.key(["r"], () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				this.promptForRename(item.task, (newTitle) => {
					state().renameTask(item.taskId, newTitle);
				});
			}
		});

		// Edit task with editor
		this.list.key(["e"], async () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				await state().editTaskWithEditor(item.taskId);
			}
		});

		// Expand all
		this.list.key(["*"], () => {
			state().expandAll();
		});

		// Collapse all
		this.list.key(["_"], () => {
			state().collapseAll();
		});

		// Toggle dependency tree view
		this.list.key(["d"], () => {
			state().toggleTreeViewMode();
		});

		// Set task as tree root (focus on this task's subtree)
		this.list.key(["f"], () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				// Set this task as the selected project to root the tree at this task
				state().selectProject(item.taskId);
				state().setStatusMessage(`Focused on task: ${item.task.title}`);
			}
		});

		// Reset tree root to show all projects (escape from focused view)
		this.list.key(["escape", "u"], () => {
			state().selectProject(null);
			state().setStatusMessage("Showing all projects");
		});

		// Mouse click handling - double click to set as root
		this.list.on("click", () => {
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				// On single click, just select the task
				state().selectTask(item.taskId);
			}
		});

		// Selection change handler
		this.list.on("select item", () => {
			if (this.isRendering) return;
			const selectedIndex = this.list.selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				this.store.getState().selectTask(item.taskId);
			}
		});
	}

	private confirmDelete(task: Task, callback: (cascade: boolean) => void) {
		// Temporarily disable renders to prevent jittering
		const originalRender = this.render.bind(this);
		let renderingDisabled = true;

		// Override render to prevent updates during confirmation
		this.render = (state: DashboardStore) => {
			if (!renderingDisabled) {
				originalRender(state);
			}
		};

		// Get child count for the task
		const state = this.store.getState();
		const taskNode = state.trackingTree?.find((t) => t.id === task.id);
		const childCount = taskNode ? taskNode.getAllDescendants().length : 0;

		// Create the dialog text based on whether task has children
		let promptText: string;
		if (childCount > 0) {
			promptText = `Delete "${task.title}" and ${childCount} children? (y/t/n)`;
		} else {
			promptText = `Delete "${task.title}"? (y/n)`;
		}

		const prompt = blessed.prompt({
			parent: this.list.screen,
			top: "center",
			left: "center",
			height: "shrink",
			width: Math.max(50, promptText.length + 10),
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "red",
				},
			},
			label: " Confirm Delete ",
		});

		const cleanup = () => {
			// Re-enable rendering
			renderingDisabled = false;
			this.render = originalRender;

			// Remove the prompt
			if (prompt.parent) {
				prompt.destroy();
			}

			// Force a render to update display
			this.list.screen.render();
		};

		prompt.input(promptText, "", (err, value) => {
			cleanup();
			if (err || !value) return;

			const response = value.toLowerCase().trim();

			if (response === "y" || response === "yes") {
				// Delete with cascade (if has children) or simple delete (if no children)
				callback(childCount > 0);
			} else if (response === "t" && childCount > 0) {
				// Delete task only (no cascade)
				callback(false);
			}
			// Any other response cancels the operation
		});

		// Handle escape/cancel
		prompt.key(["escape", "C-c"], () => {
			cleanup();
		});
	}

	private promptForRename(task: Task, callback: (newTitle: string) => void) {
		// Temporarily disable renders to prevent jittering
		const originalRender = this.render.bind(this);
		let renderingDisabled = true;

		// Override render to prevent updates during prompt
		this.render = (state: DashboardStore) => {
			if (!renderingDisabled) {
				originalRender(state);
			}
		};

		const prompt = blessed.prompt({
			parent: this.list.screen,
			top: "center",
			left: "center",
			height: "shrink",
			width: "50%",
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "yellow",
				},
			},
			label: " New Task Title ",
		});

		const cleanup = () => {
			// Re-enable rendering
			renderingDisabled = false;
			this.render = originalRender;

			// Remove the prompt
			if (prompt.parent) {
				prompt.destroy();
			}

			// Force a render to update display
			this.list.screen.render();
		};

		prompt.input("Enter new title:", task.title, (err, value) => {
			cleanup();
			if (!err && value && value.trim()) {
				callback(value.trim());
			}
		});

		// Handle escape/cancel
		prompt.key(["escape", "C-c"], () => {
			cleanup();
		});
	}

	private render(state: DashboardStore) {
		// Skip rendering if editor is active
		if (state.editorActive) {
			return;
		}

		this.isRendering = true;

		try {
			const items = this.buildTreeItems(state);
			this.currentItems = items;

			// Remember current selection
			const currentSelection = this.list.selected || 0;
			const currentSelectedTaskId = this.currentItems[currentSelection]?.taskId;

			// Force complete redraw by temporarily hiding and showing the list
			this.list.hide();

			// Clear the list completely before setting new items
			this.list.clearItems();
			this.list.setContent("");

			// Clear the internal render cache if it exists
			if (this.list._clines) {
				this.list._clines = [];
			}

			// Set items with enhanced color integration that preserves status glyph colors
			const formattedItems = items.map((item) => {
				const relationship = state.getTaskRelationshipToSelected(
					item.taskId,
				) as DependencyRelationship;

				// Use the color integration system to apply dependency highlighting
				// while preserving the status glyph colors from TaskLineFormatter
				const styledResult = this.colorIntegration.styleTaskLine(
					item.label,
					relationship,
				);

				return styledResult.styledLine;
			});

			this.list.setItems(formattedItems);

			// Show the list again
			this.list.show();

			// Restore selection - prioritize selectedTaskId from state, fallback to current selection
			let targetIndex = 0;
			if (state.selectedTaskId) {
				const stateSelectedIndex = items.findIndex(
					(item) => item.taskId === state.selectedTaskId,
				);
				if (stateSelectedIndex !== -1) {
					targetIndex = stateSelectedIndex;
				}
			} else if (currentSelectedTaskId) {
				const preservedIndex = items.findIndex(
					(item) => item.taskId === currentSelectedTaskId,
				);
				if (preservedIndex !== -1) {
					targetIndex = preservedIndex;
				}
			}

			// Ensure the target index is within bounds
			if (targetIndex >= 0 && targetIndex < items.length) {
				this.list.select(targetIndex);
			}

			// Force the parent box to redraw as well
			if (this.list.parent) {
				this.list.parent.render();
			}
		} finally {
			this.isRendering = false;
		}

		// Always render the screen
		this.list.screen.render();
	}

	private buildTreeItems(state: DashboardStore): TaskTreeItem[] {
		const { trackingTree, treeViewMode } = state;

		if (!trackingTree) {
			return [];
		}

		if (treeViewMode === "dependencies") {
			return this.buildDependencyTreeItems(state);
		} else {
			return this.buildHierarchyTreeItems(state);
		}
	}

	private buildHierarchyTreeItems(state: DashboardStore): TaskTreeItem[] {
		const {
			trackingTree,
			expandedTaskIds,
			selectedProjectId,
			showCompletedTasks,
		} = state;

		if (!trackingTree) {
			return [];
		}

		const items: TaskTreeItem[] = [];

		// Helper function to sort children by status and priority score - done tasks go to bottom, higher priority scores go first within each group
		const sortChildrenByStatus = (
			children: readonly (TaskTree | TrackingTaskTree)[],
		) => {
			return [...children].sort((a, b) => {
				const aIsDone =
					a.task.status === "done" || a.task.status === "archived";
				const bIsDone =
					b.task.status === "done" || b.task.status === "archived";

				// If one is done and the other isn't, put done task last
				if (aIsDone && !bIsDone) return 1;
				if (!aIsDone && bIsDone) return -1;

				// If both have same "doneness", sort by priority score (higher scores first)
				const aScore = a.task.priorityScore ?? 50;
				const bScore = b.task.priorityScore ?? 50;
				if (aScore !== bScore) {
					return bScore - aScore; // Higher scores first
				}

				// If same priority score, sort by creation date (older tasks first)
				return a.task.createdAt.getTime() - b.task.createdAt.getTime();
			});
		};

		const addTreeNode = (node: TaskTree | TrackingTaskTree, depth: number) => {
			// Apply status filtering: skip completed tasks if showCompletedTasks is false
			const isCompleted =
				node.task.status === "done" || node.task.status === "archived";
			const shouldSkipTask = !showCompletedTasks && isCompleted;

			if (!shouldSkipTask) {
				const hasChildren = node.getChildren().length > 0;
				const isExpanded = expandedTaskIds.has(node.task.id);

				items.push({
					taskId: node.task.id,
					label: this.formatTaskLabel(
						node.task,
						depth,
						hasChildren,
						isExpanded,
						items.length, // Use current array length as index
					),
					depth,
					isExpanded,
					hasChildren,
					task: node.task,
					index: items.length, // Store the index for reference
				});

				// Add children if expanded, sorted with done tasks at bottom
				if (isExpanded && hasChildren) {
					const sortedChildren = sortChildrenByStatus(node.getChildren());
					for (const child of sortedChildren) {
						addTreeNode(child, depth + 1);
					}
				}
			} else if (node.getChildren().length > 0) {
				// Even if we skip the parent task, we still need to process children
				// in case they should be visible (e.g., incomplete children of completed parent)
				const sortedChildren = sortChildrenByStatus(node.getChildren());
				for (const child of sortedChildren) {
					addTreeNode(child, depth); // Keep same depth since parent is hidden
				}
			}
		};

		// If a specific project is selected, show only that project's task tree
		if (selectedProjectId) {
			const selectedProjectNode = trackingTree.find(
				(task) => task.id === selectedProjectId,
			);
			if (selectedProjectNode) {
				// Show the selected project as root (depth 0) with its children
				addTreeNode(selectedProjectNode, 0);
			}
		} else {
			// Show all root-level tasks (children of the project root) when no specific project is selected
			// Sort root tasks with done tasks at bottom
			const sortedRootTasks = sortChildrenByStatus(trackingTree.getChildren());
			for (const rootTask of sortedRootTasks) {
				addTreeNode(rootTask, 0);
			}
		}

		return items;
	}

	private buildDependencyTreeItems(state: DashboardStore): TaskTreeItem[] {
		const {
			trackingTree,
			trackingDependencyGraph,
			expandedTaskIds,
			showCompletedTasks,
		} = state;

		if (!trackingTree || !trackingDependencyGraph) {
			return [];
		}

		const items: TaskTreeItem[] = [];
		const visited = new Set<string>();

		// Helper function to sort dependents by status and priority score - done tasks go to bottom, higher priority scores go first within each group
		const sortDependentsByStatus = (dependentIds: string[]) => {
			return [...dependentIds].sort((aId, bId) => {
				const aTask = trackingTree.find((task) => task.id === aId);
				const bTask = trackingTree.find((task) => task.id === bId);

				if (!aTask || !bTask) return 0;

				const aIsDone =
					aTask.task.status === "done" || aTask.task.status === "archived";
				const bIsDone =
					bTask.task.status === "done" || bTask.task.status === "archived";

				// If one is done and the other isn't, put done task last
				if (aIsDone && !bIsDone) return 1;
				if (!aIsDone && bIsDone) return -1;

				// If both have same "doneness", sort by priority score (higher scores first)
				const aScore = aTask.task.priorityScore ?? 50;
				const bScore = bTask.task.priorityScore ?? 50;
				if (aScore !== bScore) {
					return bScore - aScore; // Higher scores first
				}

				// If same priority score, sort by creation date (older tasks first)
				return aTask.task.createdAt.getTime() - bTask.task.createdAt.getTime();
			});
		};

		// Helper function to add a task and its dependents
		const addDependencyNode = (taskId: string, depth: number) => {
			if (visited.has(taskId) || depth > 10) {
				// Prevent infinite loops and excessive depth
				return;
			}

			visited.add(taskId);
			const taskNode = trackingTree.find((task) => task.id === taskId);
			if (!taskNode) {
				return;
			}

			// Apply status filtering: skip completed tasks if showCompletedTasks is false
			const isCompleted =
				taskNode.task.status === "done" || taskNode.task.status === "archived";
			const shouldSkipTask = !showCompletedTasks && isCompleted;

			if (!shouldSkipTask) {
				const dependents = trackingDependencyGraph.getDependents(taskId);
				const hasChildren = dependents.length > 0;
				const isExpanded = expandedTaskIds.has(taskId);

				items.push({
					taskId: taskId,
					label: this.formatTaskLabel(
						taskNode.task,
						depth,
						hasChildren,
						isExpanded,
						items.length,
					),
					depth: depth,
					isExpanded: isExpanded,
					hasChildren: hasChildren,
					task: taskNode.task,
					index: items.length,
				});

				// Add dependents if expanded, sorted with done tasks at bottom
				if (isExpanded && hasChildren) {
					const sortedDependents = sortDependentsByStatus(dependents);
					for (const dependentId of sortedDependents) {
						addDependencyNode(dependentId, depth + 1);
					}
				}
			} else {
				// Even if we skip the task, we still need to process its dependents
				// in case they should be visible
				const dependents = trackingDependencyGraph.getDependents(taskId);
				const sortedDependents = sortDependentsByStatus(dependents);
				for (const dependentId of sortedDependents) {
					addDependencyNode(dependentId, depth); // Keep same depth since parent is hidden
				}
			}
		};

		// Find root tasks (tasks with no dependencies) and start the tree from there
		const allTaskIds = new Set<string>();
		trackingTree.walkDepthFirst((node) => {
			allTaskIds.add(node.task.id);
		});

		const rootTasks = Array.from(allTaskIds).filter((taskId) => {
			const dependencies = trackingDependencyGraph.getDependencies(taskId);
			return dependencies.length === 0;
		});

		// Sort root tasks with done tasks at bottom and higher priority scores first within each group, then add each root task and its dependency tree
		const sortedRootTasks = rootTasks.sort((aId, bId) => {
			const aTask = trackingTree.find((task) => task.id === aId);
			const bTask = trackingTree.find((task) => task.id === bId);

			if (!aTask || !bTask) return 0;

			const aIsDone =
				aTask.task.status === "done" || aTask.task.status === "archived";
			const bIsDone =
				bTask.task.status === "done" || bTask.task.status === "archived";

			// If one is done and the other isn't, put done task last
			if (aIsDone && !bIsDone) return 1;
			if (!aIsDone && bIsDone) return -1;

			// If both have same "doneness", sort by priority score (higher scores first)
			const aScore = aTask.task.priorityScore ?? 50;
			const bScore = bTask.task.priorityScore ?? 50;
			if (aScore !== bScore) {
				return bScore - aScore; // Higher scores first
			}

			// If same priority score, sort by creation date (older tasks first)
			return aTask.task.createdAt.getTime() - bTask.task.createdAt.getTime();
		});

		for (const rootTaskId of sortedRootTasks) {
			addDependencyNode(rootTaskId, 0);
		}

		return items;
	}

	private formatTaskLabel(
		task: Task,
		depth: number,
		hasChildren: boolean,
		isExpanded: boolean,
		index: number,
	): string {
		// Prepare task line info for the formatter
		const taskLineInfo: TaskLineInfo = {
			task,
			index: index + 1, // Convert to 1-based indexing for display
			depth,
			hasChildren,
			isExpanded,
			priorityIndicator: this.getPriorityIcon(task.priorityScore),
			dependencyIndicator: this.getDependencyIndicator(task.id),
		};

		// Use the task line formatter to create the properly formatted line
		const formattedLine = this.taskLineFormatter.formatTaskLine(taskLineInfo);

		// Pad the label to ensure it fills the entire line width
		// This helps overwrite any residual text when collapsing
		const maxWidth = (this.list.width as number) - 4; // Account for borders and padding
		let label = formattedLine.fullLine;
		if (label.length < maxWidth) {
			label = label.padEnd(maxWidth, " ");
		}

		return label;
	}

	private getPriorityIcon(priorityScore: number): string {
		// Priority icons for visual distinction in tree view
		// Priority scores are displayed elsewhere in the UI
		if (priorityScore > 70) {
			return " !"; // High priority
		} else if (priorityScore < 20) {
			return " ~"; // Low priority
		} else {
			return ""; // Medium priority
		}
	}

	private getDependencyIndicator(taskId: string): string {
		const state = this.store.getState();

		// Only show indicators if we have a selected task
		if (!state.selectedTaskId) {
			return "";
		}

		const relationship = state.getTaskRelationshipToSelected(taskId);

		switch (relationship) {
			case "blocking-pending":
				return " ⚠"; // Task is blocking the selected task (pending)
			case "blocking-completed":
				return " ✓"; // Task is blocking the selected task (done)
			case "dependent":
				return " ←"; // Task depends on the selected task
			case "related":
				return " ~"; // Task shares dependencies
			default:
				return "";
		}
	}
}
