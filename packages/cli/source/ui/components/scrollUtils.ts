import type { Task } from '@astrolabe/core';

export interface ScrollState {
  scrollOffset: number;
  viewportHeight: number;
  totalContentHeight: number;
}

export interface ViewportSlice {
  startIndex: number;
  endIndex: number;
  newScrollOffset: number;
  hasChanged: boolean;
}

/**
 * Return a clamped value between min and max inclusive.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Given the currently selected index and the existing scroll offset, ensure that
 * the selected item is visible inside the viewport. The algorithm is purposely
 * simple to avoid the "jitter" behaviour that arose from the previous more
 * aggressive auto-scroll implementation.
 *
 * Behaviour:
 *   - If the selected index is above the current window → scroll so it is the
 *     first line in view.
 *   - If it is below the current window → scroll so it is the last line in view.
 *   - Otherwise do not change the offset.
 *
 * The function never jumps unless the selected item would otherwise be outside
 * of the visible slice.  This dramatically reduces scroll thrashing.
 */
export function calculateViewportSlice(
  selectedIndex: number,
  currentScrollOffset: number,
  viewportHeight: number,
  totalItems: number
): ViewportSlice {
  // Guard against empty lists / invalid heights
  if (totalItems === 0 || viewportHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      newScrollOffset: 0,
      hasChanged: false,
    };
  }

  const maxScrollOffset = Math.max(0, totalItems - viewportHeight);
  let newScrollOffset = currentScrollOffset;

  if (selectedIndex >= 0) {
    if (selectedIndex < currentScrollOffset) {
      // Selected above viewport – bring it to top
      newScrollOffset = selectedIndex;
    } else if (selectedIndex >= currentScrollOffset + viewportHeight) {
      // Selected below viewport – bring it to bottom
      newScrollOffset = selectedIndex - viewportHeight + 1;
    }
  }

  newScrollOffset = clamp(newScrollOffset, 0, maxScrollOffset);
  const startIndex = newScrollOffset;
  const endIndex = Math.min(totalItems, startIndex + viewportHeight);

  return {
    startIndex,
    endIndex,
    newScrollOffset,
    hasChanged: newScrollOffset !== currentScrollOffset,
  };
}

/**
 * Get all visible tasks in a flattened list for viewport calculation
 */
export function getVisibleTasksList(
  tasks: Task[],
  expandedTaskIds: Set<string>,
  parentId: string | null = null
): Task[] {
  const children = tasks.filter((t: Task) => t.parentId === parentId);
  const result: Task[] = [];

  for (const child of children) {
    result.push(child);
    // If task is expanded, include its children
    if (expandedTaskIds.has(child.id)) {
      result.push(...getVisibleTasksList(tasks, expandedTaskIds, child.id));
    }
  }

  return result;
}

/**
 * Calculate task depth in the hierarchy
 */
export function getTaskDepth(task: Task, allTasks: Task[]): number {
  let depth = 0;
  let currentTask = task;

  while (currentTask.parentId) {
    const parent = allTasks.find((t) => t.id === currentTask.parentId);
    if (!parent) break;
    depth++;
    currentTask = parent;
  }

  return depth;
}

/**
 * Calculate the effective viewport height accounting for UI elements
 */
export function calculateViewportHeight(maxHeight?: number): number {
  if (!maxHeight) return 15; // Default fallback

  // Reserve space for:
  // - Padding inside the TaskTree box (2 lines)
  // We no longer reserve a fixed amount for the optional
  // indicator lines because they are conditional and have
  // historically caused the viewport calculation to
  // under-estimate available rows – resulting in blank
  // space at the bottom while content above is scrolled
  // out of view.
  const reservedSpace = 2;

  return Math.max(5, maxHeight - reservedSpace);
} 