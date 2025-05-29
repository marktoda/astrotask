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
			scrollbar: {
				ch: " ",
				track: {
					bg: "gray",
				},
				style: {
					inverse: true,
				},
			},
		});

		this.setupEventHandlers();

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			this.render(state);
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

		// Expand all
		this.list.key(["*"], () => {
			state().expandAll();
		});

		// Collapse all
		this.list.key(["_"], () => {
			state().collapseAll();
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
				type: "line",
			},
			style: {
				border: {
					fg: "red",
				},
			},
			label: " Confirm Delete ",
		});

		question.ask(`Delete task "${task.title}"? (y/n)`, (err, value) => {
			if (!err && value && value.toLowerCase() === "y") {
				callback();
			}
		});
	}

	private render(state: DashboardStore) {
		this.isRendering = true;

		try {
			const items = this.buildTreeItems(state);
			this.currentItems = items;

			// Remember current selection
			const currentSelection = (this.list as any).selected || 0;
			const currentSelectedTaskId = this.currentItems[currentSelection]?.taskId;

			// Set items without ANSI codes to avoid blessed parsing issues
			const plainItems = items.map((item) => this.stripAnsi(item.label));
			this.list.setItems(plainItems);

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
		} finally {
			this.isRendering = false;
		}

		// Always render the screen
		this.list.screen.render();
	}

	private buildTreeItems(state: DashboardStore): TaskTreeItem[] {
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
		const blockIcon = this.getBlockIcon(task);

		let label = `${indent}${expandIcon} ${statusIcon} ${task.title}${priorityIcon}${blockIcon}`;

		// Add dependency info if blocked
		if (this.isTaskBlocked(task) && this.getBlockingTasks(task).length > 0) {
			label += ` (blocked by ${this.getBlockingTasks(task).length} task${this.getBlockingTasks(task).length > 1 ? "s" : ""})`;
		}

		return label;
	}

	private getStatusIcon(status: Task["status"]): string {
		switch (status) {
			case "done":
				return "✓";
			case "in-progress":
				return "●";
			case "pending":
				return "○";
			case "cancelled":
				return "✗";
			case "archived":
				return "□";
			default:
				return "?";
		}
	}

	private getPriorityIcon(priority: Task["priority"]): string {
		switch (priority) {
			case "high":
				return " !";
			case "low":
				return " ↓";
			case "medium":
			default:
				return "";
		}
	}

	private getBlockIcon(task: Task): string {
		return this.isTaskBlocked(task) ? " ⎋" : "";
	}

	private isTaskBlocked(task: Task): boolean {
		const state = this.store.getState();
		return state.isTaskBlocked(task.id);
	}

	private getBlockingTasks(task: Task): string[] {
		const state = this.store.getState();
		return state.getBlockingTasks(task.id);
	}

	private stripAnsi(str: string): string {
		// Simple ANSI code removal - blessed doesn't need complex parsing
		return str.replace(/\x1b\[[0-9;]*m/g, "");
	}
}
