import type { Task } from "@astrolabe/core";
import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

export class DetailPane {
	private box: blessed.Widgets.BoxElement;
	private content: blessed.Widgets.TextElement;
	private unsubscribe: () => void;

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		// Create the container box
		this.box = blessed.box({
			parent: this.parent,
			label: " Task Details ",
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "cyan",
				},
				focus: {
					border: {
						fg: "yellow",
					},
				},
			},
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
			tags: true, // Enable blessed tag parsing
			style: {
				scrollbar: {
					bg: "gray",
				},
			},
		});

		// Add key binding to toggle view modes
		this.content.key(['g'], () => {
			this.store.getState().toggleDetailViewMode();
		});

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			this.render(state);
		});

		// Initial render
		this.render(this.store.getState());
	}

	private render(state: DashboardStore) {
		const { selectedTaskId, trackingTree, detailViewMode } = state;

		if (!selectedTaskId || !trackingTree) {
			this.content.setContent("No task selected");
			this.box.screen.render();
			return;
		}

		const taskNode = trackingTree.find(
			(task: Task) => task.id === selectedTaskId,
		);
		if (!taskNode) {
			this.content.setContent("Task not found");
			this.box.screen.render();
			return;
		}

		const task = taskNode.task;
		
		if (detailViewMode === "dependencies") {
			this.renderDependencyGraphView(state, task);
		} else {
			this.renderNormalView(state, task, taskNode);
		}
	}

	private renderNormalView(state: DashboardStore, task: Task, taskNode: any) {
		const { trackingTree } = state;
		const lines: string[] = [];

		// Header
		lines.push(`Task: ${task.title}`);
		lines.push(`ID: ${task.id}`);
		lines.push(`Status: ${task.status}`);
		lines.push(`Priority: ${task.priority}`);
		lines.push("");
		lines.push("{gray-fg}Press 'g' for dependency graph view{/gray-fg}");
		lines.push("");

		// Description
		if (task.description) {
			lines.push("Description:");
			lines.push(task.description);
			lines.push("");
		}

		// Children
		const children = taskNode.getChildren();
		if (children.length > 0) {
			lines.push("Subtasks:");
			children.forEach((child: any) => {
				const statusIcon = this.getStatusIcon(child.task.status);
				lines.push(`  ${statusIcon} ${child.task.title}`);
			});
			lines.push("");
		}

		// Dependencies - use new store methods with prettier display
		const deps = state.getTaskDependencies(task.id);
		if (deps.length > 0) {
			lines.push("{cyan-fg}🔗 Dependencies (required first):{/cyan-fg}");
			deps.forEach((depId: string) => {
				const depTaskNode = trackingTree?.find(
					(task: Task) => task.id === depId,
				);
				if (depTaskNode) {
					const status = depTaskNode.task.status;
					const statusIcon = this.getDependencyStatusIcon(status);
					const statusColor = this.getDependencyStatusColor(status);
					const priorityIcon = this.getPriorityEmoji(depTaskNode.task.priority);
					lines.push(`  ${statusIcon} {${statusColor}-fg}${depTaskNode.task.title}{/${statusColor}-fg} ${priorityIcon}`);
				}
			});
			lines.push("");
		}

		// Dependents - use new store methods with prettier display  
		const dependents = state.getTaskDependents(task.id);
		if (dependents.length > 0) {
			lines.push("{magenta-fg}⛓️  Blocks these tasks:{/magenta-fg}");
			dependents.forEach((dependentId: string) => {
				const dependentTaskNode = trackingTree?.find(
					(task: Task) => task.id === dependentId,
				);
				if (dependentTaskNode) {
					const status = dependentTaskNode.task.status;
					const statusIcon = this.getDependencyStatusIcon(status);
					const statusColor = this.getDependencyStatusColor(status);
					const priorityIcon = this.getPriorityEmoji(dependentTaskNode.task.priority);
					lines.push(`  ${statusIcon} {${statusColor}-fg}${dependentTaskNode.task.title}{/${statusColor}-fg} ${priorityIcon}`);
				}
			});
			lines.push("");
		}

		// Show if task is blocked with enhanced display
		const isBlocked = state.isTaskBlocked(task.id);
		if (isBlocked) {
			const blockingTasks = state.getBlockingTasks(task.id);
			lines.push("{red-fg}🚫 BLOCKED BY:{/red-fg}");
			blockingTasks.forEach((blockingId: string) => {
				const blockingTaskNode = trackingTree?.find(
					(task: Task) => task.id === blockingId,
				);
				if (blockingTaskNode) {
					const priorityIcon = this.getPriorityEmoji(blockingTaskNode.task.priority);
					lines.push(`  ⏸️  {yellow-fg}${blockingTaskNode.task.title}{/yellow-fg} ${priorityIcon}`);
				}
			});
			lines.push("");
			lines.push("{yellow-fg}💡 Complete dependencies above to unblock this task{/yellow-fg}");
			lines.push("");
		}

		this.content.setContent(lines.join("\n"));
		this.box.screen.render();
	}

	private renderDependencyGraphView(state: DashboardStore, task: Task) {
		const { trackingTree } = state;
		if (!trackingTree) return;
		
		const lines: string[] = [];

		// Header
		lines.push("{bold}{cyan-fg}🕸️  Dependency Graph View{/bold}{/cyan-fg}");
		lines.push(`{bold}Task: ${task.title}{/bold} (${task.id})`);
		lines.push("");
		lines.push("{gray-fg}Press 'g' for normal detail view{/gray-fg}");
		lines.push("");

		// Build dependency tree visualization
		const deps = state.getTaskDependencies(task.id);
		const dependents = state.getTaskDependents(task.id);
		const isBlocked = state.isTaskBlocked(task.id);

		// Show upstream dependencies (what this task needs)
		if (deps.length > 0) {
			lines.push("{cyan-fg}⬆️  UPSTREAM (Dependencies required before this task):{/cyan-fg}");
			this.renderDependencyTree(lines, deps, trackingTree, "  ", true);
			lines.push("");
		}

		// Show current task status
		const statusIcon = this.getDependencyStatusIcon(task.status);
		const statusColor = this.getDependencyStatusColor(task.status);
		const priorityIcon = this.getPriorityEmoji(task.priority);
		const blockIcon = isBlocked ? " 🚫" : "";
		lines.push(`{bold}📍 CURRENT TASK:{/bold}`);
		lines.push(`   ${statusIcon} {${statusColor}-fg}${task.title}{/${statusColor}-fg} ${priorityIcon}${blockIcon}`);
		lines.push("");

		// Show downstream dependents (what this task blocks)
		if (dependents.length > 0) {
			lines.push("{magenta-fg}⬇️  DOWNSTREAM (Tasks blocked by this task):{/magenta-fg}");
			this.renderDependencyTree(lines, dependents, trackingTree, "  ", false);
			lines.push("");
		}

		// Show flow summary
		lines.push("{yellow-fg}📊 Flow Summary:{/yellow-fg}");
		if (deps.length === 0) {
			lines.push("  🏁 No dependencies - can start immediately");
		} else {
			const completedDeps = deps.filter(depId => {
				const depNode = trackingTree.find((t: Task) => t.id === depId);
				return depNode?.task.status === "done";
			});
			lines.push(`  📥 Dependencies: ${completedDeps.length}/${deps.length} completed`);
		}
		
		if (dependents.length === 0) {
			lines.push("  🎯 No dependents - leaf task");
		} else {
			lines.push(`  📤 Blocks: ${dependents.length} downstream task${dependents.length > 1 ? 's' : ''}`);
		}

		if (isBlocked) {
			lines.push("  ⚠️  Currently blocked - complete dependencies first");
		} else {
			lines.push("  ✅ Ready to work on (no blocking dependencies)");
		}

		this.content.setContent(lines.join("\n"));
		this.box.screen.render();
	}

	private renderDependencyTree(lines: string[], taskIds: string[], trackingTree: any, indent: string, showAsRequirements: boolean) {
		taskIds.forEach((taskId, index) => {
			const taskNode = trackingTree.find((t: Task) => t.id === taskId);
			if (taskNode) {
				const isLast = index === taskIds.length - 1;
				const connector = isLast ? "└── " : "├── ";
				const status = taskNode.task.status;
				const statusIcon = this.getDependencyStatusIcon(status);
				const statusColor = this.getDependencyStatusColor(status);
				const priorityIcon = this.getPriorityEmoji(taskNode.task.priority);
				
				lines.push(`${indent}${connector}${statusIcon} {${statusColor}-fg}${taskNode.task.title}{/${statusColor}-fg} ${priorityIcon}`);
				
				// Show nested dependencies/dependents (limited depth)
				if (showAsRequirements) {
					const nestedDeps = this.store.getState().getTaskDependencies(taskId);
					if (nestedDeps.length > 0 && nestedDeps.length <= 3) { // Limit to avoid clutter
						const nextIndent = indent + (isLast ? "    " : "│   ");
						nestedDeps.forEach((nestedId, nestedIndex) => {
							const nestedNode = trackingTree.find((t: Task) => t.id === nestedId);
							if (nestedNode) {
								const nestedConnector = nestedIndex === nestedDeps.length - 1 ? "└── " : "├── ";
								const nestedStatusIcon = this.getDependencyStatusIcon(nestedNode.task.status);
								const nestedStatusColor = this.getDependencyStatusColor(nestedNode.task.status);
								lines.push(`${nextIndent}${nestedConnector}${nestedStatusIcon} {${nestedStatusColor}-fg}${nestedNode.task.title}{/${nestedStatusColor}-fg}`);
							}
						});
					}
				}
			}
		});
	}

	setPosition(position: blessed.Widgets.Position) {
		Object.assign(this.box, position);
	}

	focus() {
		this.content.focus();
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
				return "📁";
			default:
				return "○";
		}
	}

	private getDependencyStatusIcon(status: Task["status"]): string {
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
				return "📁";
			default:
				return "○";
		}
	}

	private getDependencyStatusColor(status: Task["status"]): string {
		switch (status) {
			case "done":
				return "green";
			case "in-progress":
				return "yellow";
			case "pending":
				return "cyan";
			case "cancelled":
				return "red";
			case "archived":
				return "gray";
			default:
				return "white";
		}
	}

	private getPriorityEmoji(priority: Task["priority"]): string {
		switch (priority) {
			case "high":
				return "🔥";
			case "medium":
				return "🔸";
			case "low":
				return "🔹";
			default:
				return "";
		}
	}

	destroy() {
		this.unsubscribe();
		this.box.destroy();
	}
}
