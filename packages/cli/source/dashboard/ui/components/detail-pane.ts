import type { Task } from "@astrolabe/core";
import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

export class DetailPane {
	private box: blessed.Widgets.BoxElement;
	private content: blessed.Widgets.TextElement;
	private unsubscribe: () => void;
	private lastRenderedTaskId: string | null = null;
	private lastRenderedViewMode: string | null = null;
	private lastContextSliceCount: number = 0;

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
		this.content.key(["g"], () => {
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

		// Skip render if nothing significant has changed
		const contextSliceCount = selectedTaskId ? state.getContextSlices(selectedTaskId).length : 0;
		if (
			selectedTaskId === this.lastRenderedTaskId &&
			detailViewMode === this.lastRenderedViewMode &&
			contextSliceCount === this.lastContextSliceCount
		) {
			return; // Skip unnecessary re-renders
		}

		this.lastRenderedTaskId = selectedTaskId;
		this.lastRenderedViewMode = detailViewMode;
		this.lastContextSliceCount = contextSliceCount;

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

		// Header with improved styling
		lines.push(`{bold}Task: ${task.title}{/bold}`);
		lines.push(`{gray-fg}ID: ${task.id}{/gray-fg}`);

		// Status with icon
		const statusIcon = this.getStatusIcon(task.status);
		const statusColor = this.getDependencyStatusColor(task.status);
		lines.push(
			`Status: ${statusIcon} {${statusColor}-fg}${task.status}{/${statusColor}-fg}`,
		);

		// Complexity value prominently displayed below status
		const complexity = state.getComplexityValue(task.id);
		const isLoadingContext = state.isLoadingContextSlices(task.id);
		const contextSlices = state.getContextSlices(task.id);
		
		if (complexity !== null) {
			const complexityColor = complexity >= 8 ? "red" : complexity >= 6 ? "yellow" : complexity >= 4 ? "cyan" : "green";
			lines.push(`Complexity: {${complexityColor}-fg}${complexity}/10{/${complexityColor}-fg} ${this.getComplexityIcon(complexity)}`);
		} else if (isLoadingContext) {
			lines.push(`Complexity: {gray-fg}Loading...{/gray-fg}`);
		} else if (contextSlices.length === 0) {
			// Don't call loadContextSlices here during render to avoid infinite loops
			// The selectTask method already handles loading context slices
			lines.push(`Complexity: {gray-fg}Not analyzed{/gray-fg}`);
		} else {
			// Context slices loaded but no complexity found
			lines.push(`Complexity: {gray-fg}Not analyzed{/gray-fg}`);
		}

		// Priority with icon
		const priorityIcon = this.getPriorityIcon(task.priority);
		const priorityDisplay = priorityIcon ? `${priorityIcon} ${task.priority}` : task.priority;
		lines.push(`Priority: ${priorityDisplay}`);

		lines.push("");
		lines.push("{gray-fg}Press 'd' for dependency graph view{/gray-fg}");
		lines.push("");

		// Description
		if (task.description) {
			lines.push("{bold}Description:{/bold}");
			// Escape the description to prevent blessed tag parsing issues
			lines.push(this.escapeForBlessed(task.description));
			lines.push("");
		}

		// Context Slices
		if (contextSlices.length > 0) {
			lines.push("{bold}{blue-fg}Context & Analysis:{/blue-fg}{/bold}");
			contextSlices.forEach((slice) => {
				const sliceType = this.getContextSliceType(slice.title);
				lines.push(`  ${sliceType.icon} {${sliceType.color}-fg}${slice.title}{/${sliceType.color}-fg}`);
				if (slice.description) {
					// Show first 2 lines of description, safely handle potential null
					const descLines = slice.description.split('\n').slice(0, 2);
					descLines.forEach(line => {
						if (line && line.trim()) {
							// Escape the line content to prevent blessed tag parsing issues
							const escapedLine = this.escapeForBlessed(line.trim());
							lines.push(`    {gray-fg}${escapedLine}{/gray-fg}`);
						}
					});
					if (slice.description.split('\n').length > 2) {
						lines.push(`    {gray-fg}...{/gray-fg}`);
					}
				}
			});
			lines.push("");
		}

		// Children/Subtasks
		const children = taskNode.getChildren();
		if (children.length > 0) {
			lines.push("{bold}Subtasks:{/bold}");
			children.forEach((child: any) => {
				const statusIcon = this.getStatusIcon(child.task.status);
				const statusColor = this.getDependencyStatusColor(child.task.status);
				lines.push(
					`  ${statusIcon} {${statusColor}-fg}${child.task.title}{/${statusColor}-fg}`,
				);
			});
			lines.push("");
		}

		// Dependencies - use new store methods with prettier display
		const deps = state.getTaskDependencies(task.id);
		if (deps.length > 0) {
			lines.push(
				"{bold}{cyan-fg}Dependencies (required first):{/cyan-fg}{/bold}",
			);
			deps.forEach((depId: string) => {
				const depTaskNode = trackingTree?.find(
					(task: Task) => task.id === depId,
				);
				if (depTaskNode) {
					const status = depTaskNode.task.status;
					const statusIcon = this.getDependencyStatusIcon(status);
					const statusColor = this.getDependencyStatusColor(status);
					const priorityIcon = this.getPriorityIcon(depTaskNode.task.priority);
					const priorityDisplay = priorityIcon ? ` ${priorityIcon}` : "";
					lines.push(
						`  ${statusIcon} {${statusColor}-fg}${depTaskNode.task.title}{/${statusColor}-fg}${priorityDisplay}`,
					);
				}
			});
			lines.push("");
		}

		// Dependents - use new store methods with prettier display
		const dependents = state.getTaskDependents(task.id);
		if (dependents.length > 0) {
			lines.push("{bold}{magenta-fg}Blocks these tasks:{/magenta-fg}{/bold}");
			dependents.forEach((dependentId: string) => {
				const dependentTaskNode = trackingTree?.find(
					(task: Task) => task.id === dependentId,
				);
				if (dependentTaskNode) {
					const status = dependentTaskNode.task.status;
					const statusIcon = this.getDependencyStatusIcon(status);
					const statusColor = this.getDependencyStatusColor(status);
					const priorityIcon = this.getPriorityIcon(
						dependentTaskNode.task.priority,
					);
					const priorityDisplay = priorityIcon ? ` ${priorityIcon}` : "";
					lines.push(
						`  ${statusIcon} {${statusColor}-fg}${dependentTaskNode.task.title}{/${statusColor}-fg}${priorityDisplay}`,
					);
				}
			});
			lines.push("");
		}

		// Show if task is blocked with enhanced display
		const isBlocked = state.isTaskBlocked(task.id);
		if (isBlocked) {
			const blockingTasks = state.getBlockingTasks(task.id);
			lines.push("{bold}{red-fg}⏸ Task is Blocked{/red-fg}{/bold}");
			lines.push("{yellow-fg}Complete these tasks first:{/yellow-fg}");
			blockingTasks.forEach((blockingId: string) => {
				const blockingTaskNode = trackingTree?.find(
					(task: Task) => task.id === blockingId,
				);
				if (blockingTaskNode) {
					const priorityIcon = this.getPriorityIcon(
						blockingTaskNode.task.priority,
					);
					const status = blockingTaskNode.task.status;
					const statusIcon = this.getStatusIcon(status);
					const priorityDisplay = priorityIcon ? ` ${priorityIcon}` : "";
					lines.push(
						`  ${statusIcon} {yellow-fg}${blockingTaskNode.task.title}{/yellow-fg}${priorityDisplay}`,
					);
				}
			});
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
		lines.push("{gray-fg}Press 'd' for normal detail view{/gray-fg}");
		lines.push("");

		// Build dependency tree visualization
		const deps = state.getTaskDependencies(task.id);
		const dependents = state.getTaskDependents(task.id);
		const isBlocked = state.isTaskBlocked(task.id);

		// Show upstream dependencies (what this task needs)
		if (deps.length > 0) {
			lines.push(
				"{cyan-fg}⬆️  UPSTREAM (Dependencies required before this task):{/cyan-fg}",
			);
			this.renderDependencyTree(lines, deps, trackingTree, "  ", true);
			lines.push("");
		}

		// Show current task status
		const statusIcon = this.getDependencyStatusIcon(task.status);
		const statusColor = this.getDependencyStatusColor(task.status);
		const priorityIcon = this.getPriorityIcon(task.priority);
		const priorityDisplay = priorityIcon ? ` ${priorityIcon}` : "";
		const blockIcon = isBlocked ? " 🚫" : "";
		lines.push(`{bold}📍 CURRENT TASK:{/bold}`);
		lines.push(
			`   ${statusIcon} {${statusColor}-fg}${task.title}{/${statusColor}-fg}${priorityDisplay}${blockIcon}`,
		);
		lines.push("");

		// Show downstream dependents (what this task blocks)
		if (dependents.length > 0) {
			lines.push(
				"{magenta-fg}⬇️  DOWNSTREAM (Tasks blocked by this task):{/magenta-fg}",
			);
			this.renderDependencyTree(lines, dependents, trackingTree, "  ", false);
			lines.push("");
		}

		// Show flow summary
		lines.push("{yellow-fg}📊 Flow Summary:{/yellow-fg}");
		if (deps.length === 0) {
			lines.push("  🏁 No dependencies - can start immediately");
		} else {
			const completedDeps = deps.filter((depId) => {
				const depNode = trackingTree.find((t: Task) => t.id === depId);
				return depNode?.task.status === "done";
			});
			lines.push(
				`  📥 Dependencies: ${completedDeps.length}/${deps.length} completed`,
			);
		}

		if (dependents.length === 0) {
			lines.push("  🎯 No dependents - leaf task");
		} else {
			lines.push(
				`  📤 Blocks: ${dependents.length} downstream task${dependents.length > 1 ? "s" : ""}`,
			);
		}

		if (isBlocked) {
			lines.push("  ⚠️  Currently blocked - complete dependencies first");
		} else {
			lines.push("  ✅ Ready to work on (no blocking dependencies)");
		}

		this.content.setContent(lines.join("\n"));
		this.box.screen.render();
	}

	private renderDependencyTree(
		lines: string[],
		taskIds: string[],
		trackingTree: any,
		indent: string,
		showAsRequirements: boolean,
	) {
		taskIds.forEach((taskId, index) => {
			const taskNode = trackingTree.find((t: Task) => t.id === taskId);
			if (taskNode) {
				const isLast = index === taskIds.length - 1;
				const connector = isLast ? "└── " : "├── ";
				const status = taskNode.task.status;
				const statusIcon = this.getDependencyStatusIcon(status);
				const statusColor = this.getDependencyStatusColor(status);
				const priorityIcon = this.getPriorityIcon(taskNode.task.priority);
				const priorityDisplay = priorityIcon ? ` ${priorityIcon}` : "";

				lines.push(
					`${indent}${connector}${statusIcon} {${statusColor}-fg}${taskNode.task.title}{/${statusColor}-fg}${priorityDisplay}`,
				);

				// Show nested dependencies/dependents (limited depth)
				if (showAsRequirements) {
					const nestedDeps = this.store.getState().getTaskDependencies(taskId);
					if (nestedDeps.length > 0 && nestedDeps.length <= 3) {
						// Limit to avoid clutter
						const nextIndent = indent + (isLast ? "    " : "│   ");
						nestedDeps.forEach((nestedId, nestedIndex) => {
							const nestedNode = trackingTree.find(
								(t: Task) => t.id === nestedId,
							);
							if (nestedNode) {
								const nestedConnector =
									nestedIndex === nestedDeps.length - 1 ? "└── " : "├── ";
								const nestedStatusIcon = this.getDependencyStatusIcon(
									nestedNode.task.status,
								);
								const nestedStatusColor = this.getDependencyStatusColor(
									nestedNode.task.status,
								);
								lines.push(
									`${nextIndent}${nestedConnector}${nestedStatusIcon} {${nestedStatusColor}-fg}${nestedNode.task.title}{/${nestedStatusColor}-fg}`,
								);
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
				return "◉";
			case "pending":
				return "○";
			case "cancelled":
				return "✗";
			case "archived":
				return "⧈";
			default:
				return "○";
		}
	}

	private getDependencyStatusIcon(status: Task["status"]): string {
		switch (status) {
			case "done":
				return "✓";
			case "in-progress":
				return "◉";
			case "pending":
				return "○";
			case "cancelled":
				return "✗";
			case "archived":
				return "⧈";
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

	private getPriorityIcon(priority: Task["priority"]): string {
		switch (priority) {
			case "high":
				return "!";
			case "medium":
				return "";
			case "low":
				return "~";
			default:
				return "";
		}
	}

	private getComplexityIcon(complexity: number): string {
		if (complexity >= 8) return "🔥"; // High complexity
		if (complexity >= 6) return "⚠️";  // Medium-high complexity
		if (complexity >= 4) return "📊"; // Medium complexity
		return "✅"; // Low complexity
	}

	private getContextSliceType(title: string): { icon: string; color: string } {
		const titleLower = title.toLowerCase();
		
		if (titleLower.includes('complexity')) {
			return { icon: "📊", color: "cyan" };
		}
		if (titleLower.includes('analysis')) {
			return { icon: "🔍", color: "blue" };
		}
		if (titleLower.includes('research')) {
			return { icon: "📚", color: "magenta" };
		}
		if (titleLower.includes('notes') || titleLower.includes('note')) {
			return { icon: "📝", color: "yellow" };
		}
		if (titleLower.includes('implementation')) {
			return { icon: "⚙️", color: "green" };
		}
		
		// Default
		return { icon: "💡", color: "white" };
	}

	// Helper method to escape content that might interfere with blessed tags
	private escapeForBlessed(text: string): string {
		// Escape curly braces and markdown characters that might be interpreted as blessed tags
		return text
			.replace(/{/g, '\\{')
			.replace(/}/g, '\\}')
			.replace(/\*\*/g, '')  // Remove markdown bold markers
			.replace(/\*/g, '')    // Remove markdown italic markers
			.replace(/_/g, '\\_'); // Escape underscores
	}

	destroy() {
		this.unsubscribe();
		this.box.destroy();
	}
}
