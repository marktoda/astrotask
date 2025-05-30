import type { Task, TaskTree, TrackingTaskTree } from "@astrolabe/core";
import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

interface TaskTreeItem {
	taskId: string;
	label: string;
	depth: number;
	isExpanded: boolean;
	hasChildren: boolean;
	task: Task;
}

export class TaskTreeComponent {
	private list: blessed.Widgets.ListElement;
	private unsubscribe: () => void;
	private lastKeyPress: number = 0;
	private keyDebounceMs: number = 150;
	private isRendering: boolean = false;
	private currentItems: TaskTreeItem[] = [];

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
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
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item && item.hasChildren) {
				state().toggleTaskExpanded(item.taskId);
			}
		});

		this.list.key(["left", "h"], () => {
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item && state().expandedTaskIds.has(item.taskId)) {
				state().toggleTaskExpanded(item.taskId);
			}
		});

		// Enter to expand/collapse or select
		this.list.key(["enter"], () => {
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				if (item.hasChildren) {
					state().toggleTaskExpanded(item.taskId);
				}
				state().selectTask(item.taskId);
			}
		});

		// Space to toggle completion status
		this.list.key(["space"], async () => {
			const now = Date.now();
			if (now - this.lastKeyPress < this.keyDebounceMs) return;
			this.lastKeyPress = now;

			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				// Cycle through states: pending -> in-progress -> done -> pending
				let newStatus: Task["status"];
				switch (item.task.status) {
					case "pending":
						newStatus = "in-progress";
						break;
					case "in-progress":
						newStatus = "done";
						break;
					case "done":
						newStatus = "pending";
						break;
					case "cancelled":
					case "archived":
						// For cancelled/archived tasks, reset to pending
						newStatus = "pending";
						break;
					default:
						// Fallback for any unexpected status
						newStatus = "pending";
						break;
				}

				try {
					// Show immediate feedback
					const currentState = state();
					currentState.setStatusMessage(
						`Updating task status to ${newStatus}...`,
					);

					// Update the status
					await state().updateTaskStatus(item.taskId, newStatus);

					// Force re-render after the async operation completes
					// The store subscription should have already triggered, but let's ensure it
					setTimeout(() => {
						this.list.screen.render();
					}, 10);
				} catch (error) {
					console.error("Error updating task status:", error);
					state().setStatusMessage("Error updating task status");
				}
			}
		});

		// Add sibling task
		this.list.key(["a"], () => {
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				const taskTree = state().getTaskTree(item.taskId);
				const parentId = taskTree?.getParent()?.task.id || null;
				this.promptForTaskTitle((title) => {
					state().addTask(parentId, title);
				});
			}
		});

		// Add child task
		this.list.key(["A"], () => {
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				this.promptForTaskTitle((title) => {
					state().addTask(item.taskId, title);
				});
			}
		});

		// Add sibling task with editor
		this.list.key(["e"], async () => {
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				const taskTree = state().getTaskTree(item.taskId);
				const parentId = taskTree?.getParent()?.task.id || null;
				await state().addTaskWithEditor(parentId);
			}
		});

		// Add child task with editor
		this.list.key(["E"], async () => {
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				await state().addTaskWithEditor(item.taskId);
			}
		});

		// Delete task
		this.list.key(["D"], () => {
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				this.confirmDelete(item.task, () => {
					state().deleteTask(item.taskId);
				});
			}
		});

		// Rename task
		this.list.key(["r"], () => {
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				this.promptForRename(item.task, (newTitle) => {
					state().renameTask(item.taskId, newTitle);
				});
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

		// Selection change handler
		this.list.on("select item", () => {
			if (this.isRendering) return;
			const selectedIndex = (this.list as any).selected;
			const item = this.currentItems[selectedIndex];
			if (item) {
				this.store.getState().selectTask(item.taskId);
			}
		});
	}

	private promptForTaskTitle(callback: (title: string) => void) {
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
			label: " New Task ",
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

		prompt.input("Enter task title:", "", (err, value) => {
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

	private confirmDelete(task: Task, callback: () => void) {
		// Temporarily disable renders to prevent jittering
		const originalRender = this.render.bind(this);
		let renderingDisabled = true;

		// Override render to prevent updates during confirmation
		this.render = (state: DashboardStore) => {
			if (!renderingDisabled) {
				originalRender(state);
			}
		};

		const question = blessed.question({
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
					fg: "red",
				},
			},
			label: " Confirm Delete ",
		});

		const cleanup = () => {
			// Re-enable rendering
			renderingDisabled = false;
			this.render = originalRender;

			// Remove the question
			if (question.parent) {
				question.destroy();
			}

			// Force a render to update display
			this.list.screen.render();
		};

		question.ask(`Delete task "${task.title}"? (y/n)`, (err, value) => {
			cleanup();
			if (!err && value && value.toLowerCase() === "y") {
				callback();
			}
		});

		// Handle escape/cancel
		question.key(["escape", "C-c", "n"], () => {
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
			const currentSelection = (this.list as any).selected || 0;
			const currentSelectedTaskId = this.currentItems[currentSelection]?.taskId;

			// Force complete redraw by temporarily hiding and showing the list
			this.list.hide();
			
			// Clear the list completely before setting new items
			this.list.clearItems();
			this.list.setContent("");
			
			// Clear the internal render cache if it exists
			if ((this.list as any)._clines) {
				(this.list as any)._clines = [];
			}
			
			// Set items with blessed color tags for blocked tasks
			const formattedItems = items.map((item) => {
				const plainLabel = this.stripAnsi(item.label);
				const isBlocked = this.isTaskBlocked(item.task);
				
				// Apply red text for blocked tasks
				if (isBlocked) {
					return `{red-fg}${plainLabel}{/red-fg}`;
				}
				
				return plainLabel;
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
				(this.list.parent as any).render();
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
		const { trackingTree, expandedTaskIds } = state;

		if (!trackingTree) {
			return [];
		}

		const items: TaskTreeItem[] = [];

		const addTreeNode = (node: TaskTree | TrackingTaskTree, depth: number) => {
			const hasChildren = node.getChildren().length > 0;
			const isExpanded = expandedTaskIds.has(node.task.id);

			items.push({
				taskId: node.task.id,
				label: this.formatTaskLabel(node.task, depth, hasChildren, isExpanded),
				depth,
				isExpanded,
				hasChildren,
				task: node.task,
			});

			// Add children if expanded
			if (isExpanded && hasChildren) {
				for (const child of node.getChildren()) {
					addTreeNode(child, depth + 1);
				}
			}
		};

		// Add all root-level tasks (children of the project root)
		for (const rootTask of trackingTree.getChildren()) {
			addTreeNode(rootTask, 0);
		}

		return items;
	}

	private buildDependencyTreeItems(state: DashboardStore): TaskTreeItem[] {
		const { trackingTree, trackingDependencyGraph, expandedTaskIds } = state;

		if (!trackingTree || !trackingDependencyGraph) {
			return [];
		}

		const items: TaskTreeItem[] = [];
		const visited = new Set<string>();

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
				),
				depth: depth,
				isExpanded: isExpanded,
				hasChildren: hasChildren,
				task: taskNode.task,
			});

			// Add dependents if expanded
			if (isExpanded && hasChildren) {
				for (const dependentId of dependents) {
					addDependencyNode(dependentId, depth + 1);
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

		// Add each root task and its dependency tree
		for (const rootTaskId of rootTasks) {
			addDependencyNode(rootTaskId, 0);
		}

		return items;
	}

	private formatTaskLabel(
		task: Task,
		depth: number,
		hasChildren: boolean,
		isExpanded: boolean,
	): string {
		const indent = "  ".repeat(depth);
		const expandIcon = hasChildren ? (isExpanded ? "▼" : "▶") : " ";
		const statusIcon = this.getStatusIcon(task.status);
		const priorityIcon = this.getPriorityIcon(task.priority);

		// Build the base label
		let label = `${indent}${expandIcon} ${statusIcon} ${task.title}`;
		
		// Add priority indicator if not medium
		if (task.priority !== "medium") {
			label += priorityIcon;
		}

		// Remove the blocked text indicator - we'll use row highlighting instead

		// Pad the label to ensure it fills the entire line width
		// This helps overwrite any residual text when collapsing
		const maxWidth = (this.list.width as number) - 4; // Account for borders and padding
		if (label.length < maxWidth) {
			label = label.padEnd(maxWidth, ' ');
		}

		return label;
	}

	private getStatusIcon(status: Task["status"]): string {
		switch (status) {
			case "done":
				return "✓";
			case "in-progress":
				return "◉";  // Changed to filled circle for better visibility
			case "pending":
				return "○";
			case "cancelled":
				return "✗";
			case "archived":
				return "⧈";  // Changed to a better archive icon
			default:
				return "?";
		}
	}

	private getPriorityIcon(priority: Task["priority"]): string {
		switch (priority) {
			case "high":
				return " !";  // Changed back to exclamation mark to avoid emoji rendering issues
			case "low":
				return " ↓";
			case "medium":
			default:
				return "";
		}
	}

	private isTaskBlocked(task: Task): boolean {
		const state = this.store.getState();
		return state.isTaskBlocked(task.id);
	}

	private stripAnsi(str: string): string {
		// Simple ANSI code removal - blessed doesn't need complex parsing
		return str.replace(/\x1b\[[0-9;]*m/g, "");
	}
}
