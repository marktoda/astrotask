import { Box, Text } from 'ink';
import { useAppStore, useTaskById, useTaskDependencies, useTaskProgress } from '../../store/index.js';
import { getTaskStatusIcon, formatProgress } from '../../store/calcProgress.js';

export function DetailPane() {
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
  
  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="gray">
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Task Details</Text>
        <Text color="gray">─────────────</Text>
      </Box>
      
      {/* Task Title */}
      <Box marginBottom={1}>
        <Text>{statusIcon} </Text>
        <Text bold>{selectedTask.title}</Text>
      </Box>
      
      {/* Task Description */}
      {selectedTask.description && (
        <Box marginBottom={1}>
          <Text color="gray">Description: </Text>
          <Text>{selectedTask.description}</Text>
        </Box>
      )}
      
      {/* Status and Priority */}
      <Box flexDirection="row" gap={2} marginBottom={1}>
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
          {dependencies.map((dep) => (
            <Box key={dep.id} paddingLeft={2}>
              <Text>{getTaskStatusIcon(dep)} </Text>
              <Text color={getStatusColor(dep.status)}>{dep.title}</Text>
              {dep.status !== 'done' && <Text color="red"> ⏳</Text>}
            </Box>
          ))}
        </Box>
      )}
      
      {/* PRD Content */}
      {selectedTask.prd && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">PRD:</Text>
          <Box paddingLeft={2}>
            <Text>{selectedTask.prd.substring(0, 200)}{selectedTask.prd.length > 200 ? '...' : ''}</Text>
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
      <Box flexDirection="column">
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