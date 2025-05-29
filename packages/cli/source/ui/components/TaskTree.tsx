import { Box, Text } from 'ink';
import type { Task } from '@astrolabe/core';
import { useAppStore, useChildTasks, useTaskProgress } from '../../store/index.js';
import { getTaskStatusIcon, formatProgress } from '../../store/calcProgress.js';

interface TaskTreeProps {
  parentId?: string | null;
  depth?: number;
  maxDepth?: number;
}

interface TaskNodeProps {
  task: Task;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  progress: number;
}

function TaskNode({ 
  task, 
  depth, 
  isSelected, 
  isExpanded, 
  progress,
}: TaskNodeProps) {
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
  
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isSelected ? 'cyan' : 'gray'}>
          {indent}{expandIcon}
        </Text>
        <Text> {statusIcon} </Text>
        <Text color={textColor} bold={isSelected}>
          {task.title}
        </Text>
        {hasChildren && (
          <Text color="gray"> ({formatProgress(progress)})</Text>
        )}
        <Text color={priorityColor}> [{task.priority}]</Text>
        {task.description && (
          <Text color="gray"> - {task.description}</Text>
        )}
      </Box>
      
      {/* Render children if expanded */}
      {hasChildren && isExpanded && (
        <TaskTree parentId={task.id} depth={depth + 1} />
      )}
    </Box>
  );
}

export function TaskTree({ parentId = null, depth = 0, maxDepth = 10 }: TaskTreeProps) {
  const childTasks = useChildTasks(parentId);
  const { selectedTaskId, expandedTaskIds } = useAppStore();
  
  // Prevent infinite recursion
  if (depth > maxDepth) {
    return <Text color="red">Max depth reached</Text>;
  }
  
  if (childTasks.length === 0) {
    if (depth === 0) {
      return (
        <Box flexDirection="column" alignItems="center" justifyContent="center">
          <Text color="gray">No tasks found</Text>
          <Text color="gray">Press 'a' to add a new task</Text>
        </Box>
      );
    }
    return null;
  }
  
  return (
    <Box flexDirection="column">
      {childTasks.map((task: Task) => {
        const progress = useTaskProgress(task.id);
        const isSelected = selectedTaskId === task.id;
        const isExpanded = expandedTaskIds.has(task.id);
        
        return (
          <TaskNode
            key={task.id}
            task={task}
            depth={depth}
            isSelected={isSelected}
            isExpanded={isExpanded}
            progress={progress}
          />
        );
      })}
    </Box>
  );
}

export default TaskTree; 