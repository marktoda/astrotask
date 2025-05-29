import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useAppStore } from '../../store/index.js';

interface CommandPaletteProps {
  onExecute: (command: string) => void;
  onCancel: () => void;
}

export function CommandPalette({ onExecute, onCancel }: CommandPaletteProps) {
  const { commandPaletteInput, setCommandPaletteInput } = useAppStore();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  // Command suggestions based on input
  const getCommandSuggestions = (input: string): string[] => {
    const commands = [
      'add "Task title" under [parentId]',
      'add "Task title"',
      'delete [taskId]',
      'dep [taskId] -> [dependencyId]',
      'move [taskId] to [parentId]',
      'status [taskId] [status]',
      'priority [taskId] [priority]',
      'expand [taskId]',
      'collapse [taskId]',
      'search "query"',
      'filter [status]',
      'help',
      'quit'
    ];
    
    if (!input.trim()) return commands.slice(0, 6);
    
    return commands.filter(cmd => 
      cmd.toLowerCase().includes(input.toLowerCase())
    ).slice(0, 8);
  };
  
  useEffect(() => {
    setSuggestions(getCommandSuggestions(commandPaletteInput));
  }, [commandPaletteInput]);
  
  const handleSubmit = (value: string) => {
    if (value.trim()) {
      onExecute(value.trim());
    } else {
      onCancel();
    }
  };
  
  return (
    <Box 
      flexDirection="column" 
      borderStyle="round"
      borderColor="cyan"
      padding={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Command Palette</Text>
        <Text color="gray"> (ESC to cancel)</Text>
      </Box>
      
      {/* Input */}
      <Box marginBottom={1}>
        <Text color="cyan">❯ </Text>
        <TextInput
          value={commandPaletteInput}
          onChange={setCommandPaletteInput}
          onSubmit={handleSubmit}
          placeholder="Enter command..."
        />
      </Box>
      
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Box flexDirection="column">
          <Text color="gray">Suggestions:</Text>
          {suggestions.map((suggestion, index) => (
            <Box key={index} paddingLeft={2}>
              <Text color="gray">• {suggestion}</Text>
            </Box>
          ))}
        </Box>
      )}
      
      {/* Help text */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">Examples:</Text>
        <Text color="gray">  add "Implement auth" under task-123</Text>
        <Text color="gray">  delete task-456</Text>
        <Text color="gray">  dep task-789 -&gt; task-123</Text>
        <Text color="gray">  status task-456 done</Text>
        <Text color="gray">  priority task-789 high</Text>
      </Box>
    </Box>
  );
}

export default CommandPalette; 