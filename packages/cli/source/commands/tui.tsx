import { useEffect, useState } from 'react';
import { Box, useInput, useApp, Text, useStdout } from 'ink';
import type { Task, TaskDependency } from '@astrolabe/core';
import { useDatabase } from '../context/DatabaseContext.js';
import { useAppStore } from '../store/index.js';
import { calculateAllTaskProgress, recalculateProgressForDirtyTasks } from '../store/calcProgress.js';
import { TaskTree } from '../ui/components/TaskTree.js';
import { DetailPane } from '../ui/components/DetailPane.js';
import StatusBar from '../ui/components/StatusBar.js';
import CommandPalette from '../ui/components/CommandPalette.js';

export const description = "Interactive TUI dashboard for task management";

// Help view component
function HelpView() {
  return (
    <Box flexDirection="column" padding={2}>
      <Text bold color="cyan">Astrolabe TUI Help</Text>
      <Text color="gray">─────────────────────</Text>
      
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="yellow">Navigation:</Text>
        <Text>  ↑/k    Move cursor up</Text>
        <Text>  ↓/j    Move cursor down</Text>
        <Text>  ←/h    Collapse node</Text>
        <Text>  →/l    Expand node</Text>
        <Text>  ⏎      Toggle task status</Text>
        <Text>  PgUp/Ctrl+u  Scroll up manually</Text>
        <Text>  PgDn/Ctrl+d  Scroll down manually</Text>
      </Box>
      
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="yellow">Task Management:</Text>
        <Text>  a      Add sibling task</Text>
        <Text>  A      Add child task</Text>
        <Text>  D      Delete task</Text>
        <Text>  :      Open command palette</Text>
      </Box>
      
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="yellow">Views:</Text>
        <Text>  v      Toggle dependency view</Text>
        <Text>  ?      Show this help</Text>
        <Text>  q      Quit application</Text>
      </Box>
      
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="yellow">Command Palette Examples:</Text>
        <Text color="gray">  add "Task title"</Text>
        <Text color="gray">  add "Subtask" under task-123</Text>
        <Text color="gray">  delete task-456</Text>
        <Text color="gray">  status task-789 done</Text>
      </Box>
      
      <Box marginTop={2}>
        <Text color="gray">Press any key to return to task view</Text>
      </Box>
    </Box>
  );
}

export default function TuiDashboard() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const db = useDatabase();
  const {
    tasks,
    selectedTaskId,
    expandedTaskIds,
    currentView,
    showCommandPalette,
    childrenByParent,
    progressByTask,
    dirtyProgressTasks,
    setTasks,
    setDependencies,
    selectTask,
    toggleTaskExpanded,
    setCurrentView,
    toggleCommandPalette,
    setCommandPaletteInput,
    updateProgress,
    markProgressDirty,
    clearDirtyProgress,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terminalSize, setTerminalSize] = useState({ 
    width: stdout?.columns || 80, 
    height: stdout?.rows || 24 
  });

  // Track terminal size changes
  useEffect(() => {
    const updateSize = () => {
      setTerminalSize({
        width: stdout?.columns || 80,
        height: stdout?.rows || 24
      });
    };

    if (stdout) {
      stdout.on('resize', updateSize);
      return () => {
        stdout.off('resize', updateSize);
      };
    }
    
    return undefined;
  }, [stdout]);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        // For now, just load tasks - dependencies will be added later
        const allTasks = await db.listTasks();
        const allDependencies: TaskDependency[] = []; // TODO: Load dependencies when available

        setTasks(allTasks);
        setDependencies(allDependencies);

        // Wait for next tick to ensure indices are rebuilt
        setTimeout(() => {
          // Calculate initial progress after indices are built
          const progressMap = calculateAllTaskProgress(allTasks, childrenByParent);
          for (const [taskId, progress] of progressMap) {
            updateProgress(taskId, progress);
          }
        }, 0);

        // Select first root task if available
        const rootTasks = allTasks.filter((t: Task) => !t.parentId);
        if (rootTasks.length > 0 && !selectedTaskId && rootTasks[0]) {
          selectTask(rootTasks[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [db]);

  // Recalculate progress for dirty tasks
  useEffect(() => {
    if (dirtyProgressTasks.size > 0) {
      const newProgress = recalculateProgressForDirtyTasks(
        dirtyProgressTasks,
        tasks,
        childrenByParent,
        progressByTask
      );
      
      for (const [taskId, progress] of newProgress) {
        updateProgress(taskId, progress);
      }
      
      clearDirtyProgress();
    }
  }, [dirtyProgressTasks, tasks, childrenByParent]);

  // Navigation and keyboard handling
  useInput((input, key) => {
    if (showCommandPalette) {
      if (key.escape) {
        toggleCommandPalette();
        setCommandPaletteInput('');
      }
      return;
    }

    // Global shortcuts
    if (input === 'q') {
      exit();
      return;
    }

    if (input === ':') {
      toggleCommandPalette();
      return;
    }

    if (input === '?') {
      setCurrentView('help');
      return;
    }

    if (input === 'v') {
      setCurrentView(currentView === 'tree' ? 'dependencies' : 'tree');
      return;
    }

    // Help view - any key returns to tree view
    if (currentView === 'help') {
      setCurrentView('tree');
      return;
    }

    // Tree view navigation
    if (currentView === 'tree') {
      // Create a flattened list of visible tasks for navigation
      const getVisibleTasks = (parentId: string | null = null): Task[] => {
        const children = tasks.filter((t: Task) => t.parentId === parentId);
        const result: Task[] = [];
        
        for (const child of children) {
          result.push(child);
          // If task is expanded, include its children
          if (expandedTaskIds.has(child.id)) {
            result.push(...getVisibleTasks(child.id));
          }
        }
        
        return result;
      };

      const visibleTasks = getVisibleTasks();
      const currentIndex = selectedTaskId ? 
        visibleTasks.findIndex((t: Task) => t.id === selectedTaskId) : -1;

      if (key.upArrow || input === 'k') {
        if (currentIndex > 0) {
          const prevTask = visibleTasks[currentIndex - 1];
          if (prevTask) {
            selectTask(prevTask.id);
          }
        } else if (visibleTasks.length > 0 && visibleTasks[0]) {
          // If at the top, stay at the first task
          selectTask(visibleTasks[0].id);
        }
      } else if (key.downArrow || input === 'j') {
        if (currentIndex < visibleTasks.length - 1 && currentIndex >= 0) {
          const nextTask = visibleTasks[currentIndex + 1];
          if (nextTask) {
            selectTask(nextTask.id);
          }
        } else if (visibleTasks.length > 0 && currentIndex === -1) {
          // If no task selected, select the first one
          const firstTask = visibleTasks[0];
          if (firstTask) {
            selectTask(firstTask.id);
          }
        }
      } else if (key.rightArrow || input === 'l') {
        if (selectedTaskId) {
          const selectedTask = tasks.find((t: Task) => t.id === selectedTaskId);
          const hasChildren = selectedTask && tasks.some((t: Task) => t.parentId === selectedTask.id);
          if (hasChildren) {
            toggleTaskExpanded(selectedTaskId);
          }
        }
      } else if (key.leftArrow || input === 'h') {
        if (selectedTaskId && expandedTaskIds.has(selectedTaskId)) {
          toggleTaskExpanded(selectedTaskId);
        }
      } else if (key.return) {
        // Toggle task status
        if (selectedTaskId) {
          toggleTaskStatus(selectedTaskId);
        }
      } else if (input === 'a') {
        // Add sibling task
        if (selectedTaskId) {
          const selectedTask = tasks.find((t: Task) => t.id === selectedTaskId);
          if (selectedTask) {
            toggleCommandPalette();
            setCommandPaletteInput(`add "New task" under ${selectedTask.parentId || ''}`);
          }
        } else {
          toggleCommandPalette();
          setCommandPaletteInput('add "New task"');
        }
      } else if (input === 'A') {
        // Add child task
        if (selectedTaskId) {
          toggleCommandPalette();
          setCommandPaletteInput(`add "New subtask" under ${selectedTaskId}`);
        }
      } else if (input === 'D') {
        // Delete task
        if (selectedTaskId) {
          toggleCommandPalette();
          setCommandPaletteInput(`delete ${selectedTaskId}`);
        }
      } else if (key.pageUp || (key.ctrl && input === 'u')) {
        // Manual scroll up
        const { viewportHeight, scrollOffset, setScrollOffset } = useAppStore.getState();
        const scrollStep = Math.max(1, Math.floor(viewportHeight / 3)); // Scroll by 1/3 of viewport
        const newOffset = Math.max(0, scrollOffset - scrollStep);
        setScrollOffset(newOffset, 'manual');
      } else if (key.pageDown || (key.ctrl && input === 'd')) {
        // Manual scroll down
        const { viewportHeight, scrollOffset, totalContentHeight, setScrollOffset } = useAppStore.getState();
        const scrollStep = Math.max(1, Math.floor(viewportHeight / 3)); // Scroll by 1/3 of viewport
        const maxOffset = Math.max(0, totalContentHeight - viewportHeight);
        const newOffset = Math.min(maxOffset, scrollOffset + scrollStep);
        setScrollOffset(newOffset, 'manual');
      }
    }
  });

  const toggleTaskStatus = async (taskId: string) => {
    const task = tasks.find((t: Task) => t.id === taskId);
    if (!task) return;

    const newStatus = task.status === 'done' ? 'pending' : 
                     task.status === 'pending' ? 'in-progress' :
                     task.status === 'in-progress' ? 'done' : 'pending';

    try {
      await db.updateTask(taskId, { status: newStatus });
      
      // Reload tasks and mark progress as dirty
      const updatedTasks = await db.listTasks();
      setTasks(updatedTasks);
      markProgressDirty(taskId);
    } catch (err) {
      // Handle error - could show notification
      console.error('Failed to update task status:', err);
    }
  };

  const handleCommandExecute = async (command: string) => {
    toggleCommandPalette();
    setCommandPaletteInput('');
    
    // Basic command parsing - this could be expanded
    const parts = command.split(' ');
    const action = parts[0];

    try {
      switch (action) {
        case 'add':
          // Parse: add "Task title" [under parentId]
          const titleMatch = command.match(/"([^"]+)"/);
          const title = titleMatch ? titleMatch[1] : parts.slice(1).join(' ').replace(/under.*/, '').trim();
          
          // Parse parent ID from "under parentId"
          const underMatch = command.match(/under\s+(\S+)/);
          const parentId = underMatch ? underMatch[1] : undefined;
          
          if (title) {
            const newTask = await db.addTask({
              title,
              description: undefined,
              status: 'pending',
              priority: 'medium',
              parentId: parentId || undefined,
              prd: undefined,
              contextDigest: undefined
            });
            
            const updatedTasks = await db.listTasks();
            setTasks(updatedTasks);
            selectTask(newTask.id);
          }
          break;
          
        case 'delete':
          const taskIdToDelete = parts[1] || selectedTaskId;
          if (taskIdToDelete) {
            await db.deleteTask(taskIdToDelete);
            const updatedTasks = await db.listTasks();
            setTasks(updatedTasks);
            
            // Select next available task
            if (selectedTaskId === taskIdToDelete) {
              const rootTasks = updatedTasks.filter((t: Task) => !t.parentId);
              if (rootTasks.length > 0 && rootTasks[0]) {
                selectTask(rootTasks[0].id);
              } else {
                selectTask(null);
              }
            }
          }
          break;
          
        case 'status':
          const taskId = parts[1];
          const newStatus = parts[2];
          if (taskId && newStatus) {
            await db.updateTask(taskId, { status: newStatus as any });
            const updatedTasks = await db.listTasks();
            setTasks(updatedTasks);
            markProgressDirty(taskId);
          }
          break;
          
        case 'quit':
          exit();
          break;
      }
    } catch (err) {
      // Handle command execution error
      console.error('Command execution failed:', err);
    }
  };

  const handleCommandCancel = () => {
    toggleCommandPalette();
    setCommandPaletteInput('');
  };

  if (loading) {
    return (
      <Box justifyContent="center" alignItems="center">
        <Text>Loading...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box justifyContent="center" alignItems="center">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={terminalSize.width} height={terminalSize.height}>
      {currentView === 'help' ? (
        <HelpView />
      ) : (
        <>
          {/* Main content area */}
          <Box flexGrow={1} flexDirection="row" width="100%" height={terminalSize.height - 3}>
            {/* Left panel - Task Tree */}
            <Box 
              flexGrow={1} 
              flexDirection="column" 
              borderStyle="single" 
              borderColor="gray" 
              width={terminalSize.width - 50}
              height="100%"
            >
              <TaskTree maxHeight={terminalSize.height - 5} />
            </Box>
            
            {/* Right panel - Detail Pane */}
            <Box width={50} flexDirection="column" height="100%">
              <DetailPane maxHeight={terminalSize.height - 5} />
            </Box>
          </Box>
          
          {/* Status bar */}
          <Box height={3} width="100%">
            <StatusBar />
          </Box>
        </>
      )}
      
      {/* Command palette overlay */}
      {showCommandPalette && (
        <Box 
          justifyContent="center" 
          alignItems="center"
          width="100%"
          height="100%"
        >
          <Box width={Math.min(80, terminalSize.width - 4)}>
            <CommandPalette 
              onExecute={handleCommandExecute}
              onCancel={handleCommandCancel}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
} 