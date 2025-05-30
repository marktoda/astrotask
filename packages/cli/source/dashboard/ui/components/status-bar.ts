import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

export class StatusBar {
	private box: blessed.Widgets.BoxElement;
	private unsubscribe: () => void;

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		// Create the status bar
		this.box = blessed.box({
			parent: this.parent,
			bottom: 0,
			left: 0,
			width: "100%",
			height: 1,
			style: {
				bg: "black",
				fg: "white",
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
		const {
			trackingTree,
			statusMessage,
			hasUnsavedChanges,
			autoFlushEnabled,
			expandedTaskIds,
			isFlushingChanges,
		} = state;

		const parts: string[] = [];

		// Project info
		if (trackingTree) {
			let totalTasks = 0;
			let doneTasks = 0;
			let pendingTasks = 0;
			let inProgressTasks = 0;

			trackingTree.walkDepthFirst((node: any) => {
				totalTasks++;
				switch (node.task.status) {
					case "done":
						doneTasks++;
						break;
					case "pending":
						pendingTasks++;
						break;
					case "in-progress":
						inProgressTasks++;
						break;
				}
			});

			const completionPercentage =
				totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
			parts.push(
				`Tasks: ${doneTasks}/${totalTasks} (${completionPercentage}%)`,
			);

			if (inProgressTasks > 0) {
				parts.push(`In Progress: ${inProgressTasks}`);
			}
			if (pendingTasks > 0) {
				parts.push(`Pending: ${pendingTasks}`);
			}
		}

		// Persistence status with better feedback
		if (isFlushingChanges) {
			parts.push("💾 Saving...");
		} else if (hasUnsavedChanges) {
			parts.push("● Unsaved");
			if (autoFlushEnabled) {
				parts.push("(auto-save active)");
			}
		} else {
			parts.push("✓ Saved");
		}

		// Status message
		if (statusMessage) {
			parts.push(`| ${statusMessage}`);
		}

		// Expanded tasks info
		if (expandedTaskIds.size > 0) {
			parts.push(`Expanded: ${expandedTaskIds.size}`);
		}

		const content = parts.join(" ");
		this.box.setContent(content);
		this.box.screen.render();
	}

	setPosition(position: blessed.Widgets.Position) {
		Object.assign(this.box, position);
	}

	focus() {
		// Status bar doesn't take focus
	}

	destroy() {
		this.unsubscribe();
		this.box.destroy();
	}
}
