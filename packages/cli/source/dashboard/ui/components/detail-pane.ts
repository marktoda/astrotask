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

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			this.render(state);
		});

		// Initial render
		this.render(this.store.getState());
	}

	private render(state: DashboardStore) {
		const { selectedTaskId, trackingTree } = state;

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
		const lines: string[] = [];

		// Header
		lines.push(`Task: ${task.title}`);
		lines.push(`ID: ${task.id}`);
		lines.push(`Status: ${task.status}`);
		lines.push(`Priority: ${task.priority}`);
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

		// Dependencies - use new store methods
		const deps = state.getTaskDependencies(task.id);
		if (deps.length > 0) {
			lines.push("Dependencies:");
			deps.forEach((depId: string) => {
				const depTaskNode = trackingTree.find(
					(task: Task) => task.id === depId,
				);
				if (depTaskNode) {
					const status = depTaskNode.task.status === "done" ? "✓" : "○";
					lines.push(`  ${status} ${depTaskNode.task.title}`);
				}
			});
			lines.push("");
		}

		// Dependents - use new store methods
		const dependents = state.getTaskDependents(task.id);
		if (dependents.length > 0) {
			lines.push("Blocks:");
			dependents.forEach((dependentId: string) => {
				const dependentTaskNode = trackingTree.find(
					(task: Task) => task.id === dependentId,
				);
				if (dependentTaskNode) {
					const status = dependentTaskNode.task.status === "done" ? "✓" : "○";
					lines.push(`  ${status} ${dependentTaskNode.task.title}`);
				}
			});
			lines.push("");
		}

		// Show if task is blocked
		const isBlocked = state.isTaskBlocked(task.id);
		if (isBlocked) {
			const blockingTasks = state.getBlockingTasks(task.id);
			lines.push("⚠️ This task is blocked by:");
			blockingTasks.forEach((blockingId: string) => {
				const blockingTaskNode = trackingTree.find(
					(task: Task) => task.id === blockingId,
				);
				if (blockingTaskNode) {
					lines.push(`  ○ ${blockingTaskNode.task.title}`);
				}
			});
			lines.push("");
		}

		this.content.setContent(lines.join("\n"));
		this.box.screen.render();
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

	destroy() {
		this.unsubscribe();
		this.box.destroy();
	}
}
