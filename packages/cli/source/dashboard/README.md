# Astrolabe Dashboard CLI TUI

## Architecture Overview

The dashboard is built using blessed.js for terminal UI with a clean separation of concerns:

### Core Components

- **Store (`store/index.ts`)**: Zustand-based state management that integrates with `@astrotask/core`
- **TaskTreeComponent (`ui/components/task-tree.ts`)**: Main task tree visualization
- **KeymapService (`services/keymap.ts`)**: Centralized keyboard binding management
- **Layout (`ui/components/layout.ts`)**: Main layout orchestration

### Key Improvements Made

#### 1. Native TaskTree and DependencyGraph Integration

- **Before**: Manual dependency tracking with Maps
- **After**: Direct integration with `TaskService` and `DependencyService` from `@astrotask/core`
- **Benefits**: 
  - Consistent data structures across the application
  - Leverages optimized tree traversal methods
  - Proper dependency graph analysis

#### 2. Improved Blessed Usage

- **Before**: Inconsistent type usage with excessive `any` casts
- **After**: Proper blessed widget configuration with minimal, targeted type assertions
- **Benefits**:
  - Better type safety where possible
  - Cleaner component lifecycle management
  - Proper event handling

#### 3. Enhanced Key Mapping System

- **Before**: Ad-hoc key binding scattered across components
- **After**: Centralized `KeymapService` with context-aware bindings
- **Benefits**:
  - Consistent key handling across components
  - Easy to modify and extend key bindings
  - Better separation of concerns

#### 4. Strict TypeScript Implementation

- **Before**: Weak typing with frequent `any` usage
- **After**: Strong typing with proper interfaces and error handling
- **Benefits**:
  - Better development experience
  - Fewer runtime errors
  - Improved maintainability

## Component Architecture

### Store Integration

The store now properly integrates with core services:

```typescript
// Uses TaskService for tree operations
const projectTree = await taskService.getTaskTree();

// Uses DependencyService for dependency management
const dependencyGraph = await dependencyService.createDependencyGraph();

// Leverages TaskTree methods for traversal
projectTree.walkDepthFirst((node) => {
  // Process nodes using native TaskTree API
});
```

### Key Binding System

The KeymapService provides context-aware key bindings:

```typescript
// Define context-specific keymaps
keymapService.bindKeys(element, "taskTree", {
  moveUp: () => element.up(1),
  moveDown: () => element.down(1),
  expand: () => handleExpand(),
  // ...
});
```

### Component Lifecycle

Components follow a consistent pattern:

1. **Construction**: Set up blessed widgets with proper configuration
2. **Event Binding**: Use KeymapService for consistent key handling
3. **State Subscription**: Subscribe to store updates for reactive rendering
4. **Cleanup**: Proper unsubscription and resource cleanup

## Usage

### Running the Dashboard

```bash
npm run dashboard
```

### Key Bindings

#### Global
- `q` / `Ctrl+C`: Quit (double-tap for safety)
- `?`: Show help overlay
- `:`: Open command palette
- `Tab`: Focus next panel

#### Task Tree
- `↑/k`, `↓/j`: Navigate up/down
- `→/l`: Expand node
- `←/h`: Collapse node
- `Enter`: Select/toggle node
- `Space`: Toggle task completion
- `a`: Add sibling task
- `A`: Add child task
- `D`: Delete task (with confirmation)
- `*`: Expand all nodes
- `_`: Collapse all nodes

## Development

### Adding New Components

1. Create component in `ui/components/`
2. Integrate with store for state management
3. Use KeymapService for key bindings
4. Follow the established lifecycle pattern

### Extending Key Bindings

1. Add new actions to appropriate context in `KeymapService`
2. Bind handlers in component setup
3. Update help overlay documentation

### State Management

The store provides both TaskTree and DependencyGraph access:

```typescript
// Access tree operations
const taskTree = store.getTaskTree(taskId);
const allTasks = store.getAllTasks();

// Access dependency information
const dependencies = store.getTaskDependencies(taskId);
const isBlocked = store.isTaskBlocked(taskId);
```

## Future Improvements

1. **Virtual Scrolling**: For large task trees (>1000 tasks)
2. **Search/Filter**: Quick task filtering capabilities
3. **Dependency Visualization**: Graphical dependency view
4. **Themes**: Customizable color schemes
5. **Plugin System**: Extensible component architecture 
