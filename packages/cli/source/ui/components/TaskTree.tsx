import { Box, Text } from 'ink';
import type { Task } from '@astrolabe/core';
import { useAppStore, useChildTasks, useTaskProgress } from '../../store/index.js';
import { getTaskStatusIcon, formatProgress } from '../../store/calcProgress.js';
import { useMemo } from 'react';

interface TaskTreeProps {
  parentId?: string | null;
  depth?: number;
  maxDepth?: number;
  maxHeight?: number;
}

interface TaskNodeProps {
  task: Task;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  progress: number;
}

// Helper function to get all visible tasks in a flattened list for viewport calculation
function getVisibleTasksList(tasks: Task[], expandedTaskIds: Set<string>, parentId: string | null = null): Task[] {
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

function TaskNode({ 
  task, 
  depth, 
  isSelected, 
  isExpanded, 
  progress,
  disableChildRendering = false,
}: TaskNodeProps & { disableChildRendering?: boolean }) {
  const childTasks = useChildTasks(task.id);
  const hasChildren = childTasks.length > 0;
  
  const indent = '  '.repeat(depth);
  const expandIcon = hasChildren ? (isExpanded ? '▼' : '▶') : ' ';
  const statusIcon = getTaskStatusIcon(task, progress);
  
  // Determine text color based on status and selection
  let textColor = 'white';
  if (isSelected) {
    textColor = 'cyan';
  } else {
    switch (task.status) {
      case 'done':
        textColor = 'green';
        break;
      case 'in-progress':
        textColor = 'yellow';
        break;
      case 'cancelled':
        textColor = 'red';
        break;
      case 'archived':
        textColor = 'gray';
        break;
      default:
        textColor = 'white';
    }
  }
  
  // Priority indicator
  const priorityColor = task.priority === 'high' ? 'red' : 
                       task.priority === 'medium' ? 'yellow' : 'gray';
  
  // Truncate long titles to prevent wrapping
  const maxTitleLength = 40 - (depth * 2); // Adjust based on indentation
  const truncatedTitle = task.title.length > maxTitleLength 
    ? task.title.substring(0, maxTitleLength - 3) + '...'
    : task.title;
  
  // Truncate description
  const maxDescLength = 30;
  const truncatedDesc = task.description && task.description.length > maxDescLength
    ? task.description.substring(0, maxDescLength - 3) + '...'
    : task.description;
  
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isSelected ? 'cyan' : 'gray'}>
          {indent}{expandIcon}
        </Text>
        <Text> {statusIcon} </Text>
        <Text color={textColor} bold={isSelected}>
          {truncatedTitle}
        </Text>
        {hasChildren && (
          <Text color="gray"> ({formatProgress(progress)})</Text>
        )}
        <Text color={priorityColor}> [{task.priority}]</Text>
        {truncatedDesc && (
          <Text color="gray"> - {truncatedDesc}</Text>
        )}
      </Box>
      
      {/* Only render children if not disabled and expanded */}
      {!disableChildRendering && hasChildren && isExpanded && (
        <TaskTree parentId={task.id} depth={depth + 1} />
      )}
    </Box>
  );
}

export function TaskTree({ parentId = null, depth = 0, maxDepth = 10, maxHeight }: TaskTreeProps) {
  const childTasks = useChildTasks(parentId);
  const { selectedTaskId, expandedTaskIds, tasks, scrollOffset, setScrollOffset } = useAppStore();
  
  // Prevent infinite recursion
  if (depth > maxDepth) {
    return <Text color="red">Max depth reached</Text>;
  }
  
  // Only implement viewport scrolling at the root level
  if (depth === 0) {
    if (childTasks.length === 0) {
      return (
        <Box flexDirection="column" alignItems="center" justifyContent="center" padding={1}>
          <Text color="gray">No tasks found</Text>
          <Text color="gray">Press 'a' to add a new task</Text>
        </Box>
      );
    }
    
    // Get all visible tasks in a flattened list for viewport calculation
    const allVisibleTasks = useMemo(() => 
      getVisibleTasksList(tasks, expandedTaskIds), 
      [tasks, expandedTaskIds]
    );
    
    // Calculate viewport parameters
    const viewportHeight = maxHeight ? Math.max(5, maxHeight - 4) : 15; // Reserve space for borders/padding
    const selectedIndex = selectedTaskId ? allVisibleTasks.findIndex(t => t.id === selectedTaskId) : 0;
    
    // Auto-adjust scroll offset to keep selected task visible (less aggressive)
    let newScrollOffset = scrollOffset;
    if (selectedIndex >= 0) {
      // Only scroll if selected task is completely outside viewport
      if (selectedIndex < scrollOffset) {
        newScrollOffset = Math.max(0, selectedIndex - 1); // Keep one item above visible
      }
      else if (selectedIndex >= scrollOffset + viewportHeight) {
        newScrollOffset = selectedIndex - viewportHeight + 2; // Keep one item below visible
      }
    }
    
    // Ensure scroll offset is within bounds
    const maxScrollOffset = Math.max(0, allVisibleTasks.length - viewportHeight);
    newScrollOffset = Math.max(0, Math.min(newScrollOffset, maxScrollOffset));
    
    // Update scroll offset if it changed
    if (newScrollOffset !== scrollOffset) {
      setScrollOffset(newScrollOffset);
    }
    
    // Calculate visible slice
    const startIndex = newScrollOffset;
    const endIndex = Math.min(allVisibleTasks.length, startIndex + viewportHeight);
    const visibleTasks = allVisibleTasks.slice(startIndex, endIndex);
    
    const containerProps = maxHeight ? { height: maxHeight, overflow: 'hidden' as const } : {};
    
    return (
      <Box flexDirection="column" padding={1} {...containerProps}>
        {startIndex > 0 && (
          <Text color="gray">↑ {startIndex} more tasks above</Text>
        )}
        {visibleTasks.map((task: Task) => {
          const isSelected = selectedTaskId === task.id;
          const isExpanded = expandedTaskIds.has(task.id);
          const taskDepth = getTaskDepth(task, tasks);
          
          return (
            <TaskNodeWithProgress
              key={task.id}
              task={task}
              depth={taskDepth}
              isSelected={isSelected}
              isExpanded={isExpanded}
              disableChildRendering={true}
            />
          );
        })}
        {endIndex < allVisibleTasks.length && (
          <Text color="gray">↓ {allVisibleTasks.length - endIndex} more tasks below</Text>
        )}
      </Box>
    );
  }
  
  // For nested levels, render normally (this is for recursive calls)
  if (childTasks.length === 0) {
    return null;
  }
  
  return (
    <Box flexDirection="column">
      {childTasks.map((task: Task) => {
        const isSelected = selectedTaskId === task.id;
        const isExpanded = expandedTaskIds.has(task.id);
        
        return (
          <TaskNodeWithProgress
            key={task.id}
            task={task}
            depth={depth}
            isSelected={isSelected}
            isExpanded={isExpanded}
          />
        );
      })}
    </Box>
  );
}

// Helper function to calculate task depth in the hierarchy
function getTaskDepth(task: Task, allTasks: Task[]): number {
  let depth = 0;
  let currentTask = task;
  
  while (currentTask.parentId) {
    const parent = allTasks.find(t => t.id === currentTask.parentId);
    if (!parent) break;
    depth++;
    currentTask = parent;
  }
  
  return depth;
}

// Separate component to handle the progress hook safely
function TaskNodeWithProgress({ 
  task, 
  depth, 
  isSelected, 
  isExpanded,
  disableChildRendering = false,
}: {
  task: Task;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  disableChildRendering?: boolean;
}) {
  const progress = useTaskProgress(task.id);
  
  return (
    <TaskNode
      task={task}
      depth={depth}
      isSelected={isSelected}
      isExpanded={isExpanded}
      progress={progress}
      disableChildRendering={disableChildRendering}
    />
  );
}

export default TaskTree; 