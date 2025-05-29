import { Box, Text } from 'ink';
import { useAppStore, useTaskById, useTaskDependencies, useTaskProgress } from '../../store/index.js';
import { getTaskStatusIcon, formatProgress } from '../../store/calcProgress.js';

export function DetailPane({ maxHeight }: { maxHeight?: number }) {
  const { selectedTaskId } = useAppStore();
  const selectedTask = useTaskById(selectedTaskId);
  const dependencies = useTaskDependencies(selectedTaskId || '');
  const progress = useTaskProgress(selectedTaskId || '');
  
  if (!selectedTask) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">No task selected</Text>
        <Text color="gray">Use ↑/↓ or j/k to navigate and select a task</Text>
      </Box>
    );
  }
  
  const statusIcon = getTaskStatusIcon(selectedTask, progress);
  const statusColor = getStatusColor(selectedTask.status);
  const priorityColor = getPriorityColor(selectedTask.priority);
  
  // Helper function to wrap text
  const wrapText = (text: string, maxLength: number = 35): string[] => {
    if (!text) return [];
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if ((currentLine + word).length <= maxLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };
  
  const containerProps = maxHeight ? { height: maxHeight, overflow: 'hidden' as const } : { height: "100%" };
  
  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="gray" {...containerProps}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Task Details</Text>
        <Text color="gray">─────────────</Text>
      </Box>
      
      {/* Task Title */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text>{statusIcon} </Text>
          <Text bold>{selectedTask.title.substring(0, 40)}</Text>
        </Box>
        {selectedTask.title.length > 40 && (
          <Text color="gray">{selectedTask.title.substring(40)}</Text>
        )}
      </Box>
      
      {/* Task Description */}
      {selectedTask.description && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="gray">Description:</Text>
          {wrapText(selectedTask.description).map((line, index) => (
            <Text key={index}>{line}</Text>
          ))}
        </Box>
      )}
      
      {/* Status and Priority */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="gray">Status: </Text>
          <Text color={statusColor}>{selectedTask.status}</Text>
        </Box>
        <Box>
          <Text color="gray">Priority: </Text>
          <Text color={priorityColor}>{selectedTask.priority}</Text>
        </Box>
      </Box>
      
      {/* Progress */}
      {progress > 0 && (
        <Box marginBottom={1}>
          <Text color="gray">Progress: </Text>
          <Text color={progress >= 100 ? 'green' : progress >= 50 ? 'yellow' : 'white'}>
            {formatProgress(progress)}
          </Text>
        </Box>
      )}
      
      {/* Dependencies */}
      {dependencies.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">Blocked by:</Text>
          {dependencies.slice(0, 3).map((dep) => (
            <Box key={dep.id} marginLeft={2}>
              <Text>{getTaskStatusIcon(dep)} </Text>
              <Text color={getStatusColor(dep.status)}>
                {dep.title.substring(0, 25)}{dep.title.length > 25 ? '...' : ''}
              </Text>
              {dep.status !== 'done' && <Text color="red"> ⏳</Text>}
            </Box>
          ))}
          {dependencies.length > 3 && (
            <Box marginLeft={2}>
              <Text color="gray">... and {dependencies.length - 3} more</Text>
            </Box>
          )}
        </Box>
      )}
      
      {/* PRD Content */}
      {selectedTask.prd && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">PRD:</Text>
          <Box marginLeft={2} flexDirection="column">
            {wrapText(selectedTask.prd, 35).slice(0, 3).map((line, index) => (
              <Text key={index}>{line}</Text>
            ))}
            {selectedTask.prd.length > 105 && (
              <Text color="gray">...</Text>
            )}
          </Box>
        </Box>
      )}
      
      {/* Context Digest */}
      {selectedTask.contextDigest && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">Context:</Text>
          <Box paddingLeft={2}>
            <Text>{selectedTask.contextDigest.substring(0, 150)}{selectedTask.contextDigest.length > 150 ? '...' : ''}</Text>
          </Box>
        </Box>
      )}
      
      {/* Timestamps */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">Created: {formatDate(selectedTask.createdAt)}</Text>
        <Text color="gray">Updated: {formatDate(selectedTask.updatedAt)}</Text>
      </Box>
      
      {/* Quick Actions */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">Quick Actions:</Text>
        <Text color="gray">⏎ Toggle status  a Add sibling  A Add child</Text>
        <Text color="gray">D Delete  b Add dependency  : Command palette</Text>
      </Box>
    </Box>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'done':
      return 'green';
    case 'in-progress':
      return 'yellow';
    case 'cancelled':
      return 'red';
    case 'archived':
      return 'gray';
    default:
      return 'white';
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'red';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'gray';
    default:
      return 'white';
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

export default DetailPane; 