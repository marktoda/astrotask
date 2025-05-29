import { Box, Text } from 'ink';
import { useAppStore } from '../../store/index.js';

export function StatusBar() {
  const { currentView, tasks, selectedTaskId } = useAppStore();
  
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  
  const completionRate = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
  
  return (
    <Box 
      flexDirection="row" 
      justifyContent="space-between" 
      paddingX={1}
      borderStyle="single"
      borderColor="gray"
    >
      {/* Left side - Current view and task stats */}
      <Box flexDirection="row" gap={2}>
        <Text color="cyan" bold>
          {currentView === 'tree' ? '🌳 Tree' : 
           currentView === 'dependencies' ? '🔗 Dependencies' : 
           '❓ Help'}
        </Text>
        
        <Text color="gray">|</Text>
        
        <Text>
          Tasks: <Text color="cyan">{totalTasks}</Text>
        </Text>
        
        <Text>
          Done: <Text color="green">{doneTasks}</Text>
        </Text>
        
        <Text>
          In Progress: <Text color="yellow">{inProgressTasks}</Text>
        </Text>
        
        <Text>
          Pending: <Text color="white">{pendingTasks}</Text>
        </Text>
        
        <Text>
          Complete: <Text color={completionRate >= 70 ? 'green' : completionRate >= 40 ? 'yellow' : 'red'}>
            {completionRate.toFixed(1)}%
          </Text>
        </Text>
      </Box>
      
      {/* Right side - Current selection and key hints */}
      <Box flexDirection="row" gap={2}>
        {selectedTaskId && (
          <>
            <Text color="gray">Selected:</Text>
            <Text color="cyan">{selectedTaskId.substring(0, 8)}...</Text>
            <Text color="gray">|</Text>
          </>
        )}
        
        <Text color="gray">
          {currentView === 'tree' ? 
            '↑↓/jk:nav ←→/hl:expand ⏎:toggle a:add A:child D:del b:dep v:graph :cmd ?:help q:quit' :
           currentView === 'dependencies' ?
            '↑↓/jk:nav ⏎:select v:tree ?:help q:quit' :
            '⏎/q:back'
          }
        </Text>
      </Box>
    </Box>
  );
}

export default StatusBar; 