import type { Task } from "@astrotask/core";

export interface ProgressCalculationResult {
	taskId: string;
	progress: number;
	totalLeaves: number;
	doneLeaves: number;
}

export interface ProgressCalculationOptions {
	useEffectiveStatus?: boolean;
}

/**
 * Get the status to use for calculations (actual or effective)
 */
function getStatusForCalculation(
	task: Task,
	useEffectiveStatus: boolean = false,
): Task["status"] {
	if (!useEffectiveStatus) {
		return task.status;
	}

	// If using effective status, we would need access to the task tree
	// For now, fall back to actual status
	// TODO: This could be enhanced to accept TaskTree nodes instead of plain Task objects
	return task.status;
}

/**
 * Calculate progress for a task based on its subtasks
 * Progress = (doneLeaves / totalLeaves) × 100
 * Leaves exclude cancelled tasks
 */
export function calculateTaskProgress(
	taskId: string,
	tasks: Task[],
	childrenByParent: Map<string, string[]>,
	options: ProgressCalculationOptions = {},
): ProgressCalculationResult {
	const task = tasks.find((t) => t.id === taskId);
	if (!task) {
		return { taskId, progress: 0, totalLeaves: 0, doneLeaves: 0 };
	}

	const status = getStatusForCalculation(task, options.useEffectiveStatus);

	// If task has no children, it's a leaf - calculate based on its own status
	const children = childrenByParent.get(taskId) || [];
	if (children.length === 0) {
		const isDone = status === "done";
		const isCancelled = status === "cancelled";

		// Cancelled tasks don't count towards progress
		if (isCancelled) {
			return { taskId, progress: 0, totalLeaves: 0, doneLeaves: 0 };
		}

		return {
			taskId,
			progress: isDone ? 100 : 0,
			totalLeaves: 1,
			doneLeaves: isDone ? 1 : 0,
		};
	}

	// For parent tasks, calculate based on children (post-order DFS)
	let totalLeaves = 0;
	let doneLeaves = 0;

	for (const childId of children) {
		const childResult = calculateTaskProgress(
			childId,
			tasks,
			childrenByParent,
			options,
		);
		totalLeaves += childResult.totalLeaves;
		doneLeaves += childResult.doneLeaves;
	}

	const progress = totalLeaves > 0 ? (doneLeaves / totalLeaves) * 100 : 0;

	return {
		taskId,
		progress,
		totalLeaves,
		doneLeaves,
	};
}

/**
 * Calculate progress for all tasks in the tree
 * Returns a map of taskId -> progress percentage
 */
export function calculateAllTaskProgress(
	tasks: Task[],
	childrenByParent: Map<string, string[]>,
	options: ProgressCalculationOptions = {},
): Map<string, number> {
	const progressMap = new Map<string, number>();

	// Calculate progress for all tasks
	for (const task of tasks) {
		const result = calculateTaskProgress(
			task.id,
			tasks,
			childrenByParent,
			options,
		);
		progressMap.set(task.id, result.progress);
	}

	return progressMap;
}

/**
 * Recalculate progress for dirty tasks and their ancestors
 * This is used for efficient updates when only some tasks change
 */
export function recalculateProgressForDirtyTasks(
	dirtyTaskIds: Set<string>,
	tasks: Task[],
	childrenByParent: Map<string, string[]>,
	currentProgress: Map<string, number>,
	options: ProgressCalculationOptions = {},
): Map<string, number> {
	const newProgress = new Map(currentProgress);
	const processed = new Set<string>();

	// Build parent index for efficient ancestor lookup
	const parentByChild = new Map<string, string>();
	for (const [parentId, children] of childrenByParent) {
		for (const childId of children) {
			parentByChild.set(childId, parentId);
		}
	}

	// Function to mark ancestors as dirty
	const markAncestorsDirty = (taskId: string, dirtySet: Set<string>) => {
		const parentId = parentByChild.get(taskId);
		if (parentId && !dirtySet.has(parentId)) {
			dirtySet.add(parentId);
			markAncestorsDirty(parentId, dirtySet);
		}
	};

	// Expand dirty set to include all ancestors
	const expandedDirtySet = new Set(dirtyTaskIds);
	for (const taskId of dirtyTaskIds) {
		markAncestorsDirty(taskId, expandedDirtySet);
	}

	// Recalculate progress for all dirty tasks
	for (const taskId of expandedDirtySet) {
		if (!processed.has(taskId)) {
			const result = calculateTaskProgress(
				taskId,
				tasks,
				childrenByParent,
				options,
			);
			newProgress.set(taskId, result.progress);
			processed.add(taskId);
		}
	}

	return newProgress;
}

/**
 * Get the status icon for a task based on its status and progress
 */
export function getTaskStatusIcon(
	task: Task,
	progress?: number,
	useEffectiveStatus: boolean = false,
): string {
	const status = getStatusForCalculation(task, useEffectiveStatus);

	switch (status) {
		case "done":
			return "✅";
		case "in-progress":
			return "🔄";
		case "cancelled":
			return "❌";
		case "archived":
			return "📦";
		case "pending":
		default:
			// For pending tasks with children, show progress-based icon
			if (progress !== undefined && progress > 0) {
				return progress >= 100 ? "✅" : progress >= 50 ? "🔄" : "⏳";
			}
			return "⏳";
	}
}

/**
 * Format progress percentage for display
 */
export function formatProgress(progress: number): string {
	if (progress === 0) return "0%";
	if (progress === 100) return "100%";
	return `${progress.toFixed(1)}%`;
}
