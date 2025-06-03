# Astrotask Agent Context Guide

> **Purpose**: Essential context for AI agents working with the Astrotask task management system. This document provides agent-focused workflows, MCP function references, and practical patterns.

---

## 🎯 Quick Start for Agents

### What is Astrotask?
Astrotask is a local-first, MCP-compatible task management platform designed for human + AI collaboration. Think of it as your navigation tool for project work.

### Core Capabilities
- **Hierarchical Task Management**: Tasks can have parent-child relationships
- **MCP Integration**: Full Model Context Protocol support for AI agents
- **Local-First**: Works offline with SQLite, optional sync
- **Context-Aware**: Smart bundling of task context for better decision-making

### Essential MCP Functions
```typescript
// Get next available task to work on
getNextTask(options?: { parentTaskId?: string, priority?: string, status?: string })

// Create tasks with hierarchy and dependencies  
addTasks({ tasks: [{ title, description?, parentIndex?, dependsOn?, priority?, status? }] })

// Add context information to tasks
addTaskContext({ taskId, title, description, contextType? })

// Update task status (pending, in-progress, done, cancelled, archived)
updateStatus({ taskId, status, cascade? })

// List tasks with filtering
listTasks({ statuses?, parentId?, includeProjectRoot? })

// Add dependencies between tasks
addDependency({ dependentTaskId, dependencyTaskId })
```

---

## 🏗️ Agent Workflow Patterns

### 1. Starting Work Session
```typescript
// Find next task to work on
const nextTask = await getNextTask({ priority: "high", status: "pending" });

// Update status to in-progress
await updateStatus({ taskId: nextTask.id, status: "in-progress" });

// Add context about your approach
await addTaskContext({
  taskId: nextTask.id,
  title: "Implementation Approach",
  description: "Using X pattern because Y. Key considerations: Z.",
  contextType: "implementation"
});
```

### 2. Breaking Down Complex Tasks
```typescript
// Create subtasks for a complex task
await addTasks({
  tasks: [
    {
      title: "Research authentication libraries",
      description: "Compare Auth0, Firebase Auth, and custom JWT solutions",
      parentIndex: null, // This will be the parent
      priority: "high"
    },
    {
      title: "Design user schema",
      description: "Define user model with roles and permissions",
      parentIndex: 0, // References first task as parent
      dependsOn: [], // No dependencies
      priority: "high"
    },
    {
      title: "Implement auth endpoints",
      description: "POST /login, POST /register, GET /profile endpoints",
      parentIndex: 0,
      dependsOn: [1], // Depends on schema design
      priority: "medium"
    }
  ]
});
```

### 3. Adding Research and Context
```typescript
// Document findings and decisions
await addTaskContext({
  taskId: "ABCD.1",
  title: "Library Comparison Results",
  description: "Auth0: Easy setup, costs $. Firebase: Google ecosystem, free tier. Custom JWT: Full control, more work. Recommendation: Auth0 for MVP.",
  contextType: "research"
});

await addTaskContext({
  taskId: "ABCD.2", 
  title: "Schema Design Decisions",
  description: "Using UUID for user IDs, email as unique identifier, soft-delete for users. Roles: admin, user, guest. Permissions stored as JSON array.",
  contextType: "implementation"
});
```

### 4. Managing Dependencies
```typescript
// Task B depends on Task A completion
await addDependency({
  dependentTaskId: "XYZW.2", // Task that must wait
  dependencyTaskId: "XYZW.1"  // Task that must be done first
});
```

### 5. Completing Work
```typescript
// Mark task complete and add completion context
await updateStatus({ taskId: "ABCD.1", status: "done" });

await addTaskContext({
  taskId: "ABCD.1",
  title: "Completion Summary",
  description: "Implemented using Auth0. JWT tokens stored in httpOnly cookies. Error handling for expired tokens. Next: implement refresh token rotation.",
  contextType: "general"
});
```

---

## 📋 Task Hierarchy & ID System

### Human-Readable IDs
- **Root tasks**: 4-letter codes (ABCD, XYZW, QRST)
- **Subtasks**: Dotted notation (ABCD.1, ABCD.2)  
- **Sub-subtasks**: Extended dots (ABCD.1.1, ABCD.1.2)

### Status Lifecycle
```
pending → in-progress → done
    ↓          ↓         ↑
cancelled  cancelled   archived
```

### Priority Levels
- **high**: Urgent, blocking work
- **medium**: Normal priority (default)
- **low**: Nice to have, non-blocking

---

## 🔧 Context Types & Best Practices

### Context Slice Types
- **`implementation`**: Technical approach, architecture decisions
- **`research`**: Findings from investigation, comparisons
- **`complexity`**: Risk assessment, estimation, challenges  
- **`requirements`**: Clarifications, acceptance criteria
- **`testing`**: Test strategies, edge cases, validation
- **`general`**: Progress updates, notes, miscellaneous

### Writing Effective Context
```typescript
// ✅ Good: Specific, actionable context
await addTaskContext({
  taskId: "TASK.1",
  title: "Database Migration Strategy", 
  description: "Use blue-green deployment with read replicas. Estimated downtime: 2 minutes. Rollback plan: switch DNS back to old instances.",
  contextType: "implementation"
});

// ❌ Poor: Vague, unhelpful context
await addTaskContext({
  taskId: "TASK.1",
  title: "Some notes",
  description: "Working on database stuff. It's complicated.",
  contextType: "general"
});
```

---

## 🚀 Advanced Patterns

### Project Organization
```typescript
// Create project structure with clear hierarchy
await addTasks({
  tasks: [
    {
      title: "User Authentication System", // Root epic
      description: "Complete authentication system with JWT, OAuth, and role management",
      priority: "high"
    },
    {
      title: "Backend API Development",
      parentIndex: 0,
      priority: "high"
    },
    {
      title: "Frontend Integration", 
      parentIndex: 0,
      dependsOn: [1], // Depends on backend
      priority: "medium"
    },
    {
      title: "Testing & QA",
      parentIndex: 0,
      dependsOn: [1, 2], // Depends on both backend and frontend
      priority: "low"
    }
  ]
});
```

### Context-Driven Development
```typescript
// Before starting implementation, gather context
const tasks = await listTasks({ statuses: ["pending"], parentId: "EPIC.1" });

for (const task of tasks.slice(0, 3)) {
  await addTaskContext({
    taskId: task.id,
    title: "Initial Analysis",
    description: `Task complexity: ${analyzeComplexity(task)}. Estimated effort: ${estimateEffort(task)}. Dependencies: ${task.dependencies?.join(', ') || 'none'}.`,
    contextType: "complexity"
  });
}
```

### Batch Operations
```typescript
// Process multiple related tasks efficiently
const pendingTasks = await listTasks({ statuses: ["pending"], parentId: rootTaskId });

// Start working on highest priority tasks
const highPriorityTasks = pendingTasks.filter(t => t.priority === "high");
for (const task of highPriorityTasks.slice(0, 2)) {
  await updateStatus({ taskId: task.id, status: "in-progress" });
}
```

---

## ⚡ Performance Tips

### Efficient Task Queries
```typescript
// ✅ Use specific filters to reduce data transfer
await listTasks({ 
  statuses: ["pending", "in-progress"], 
  parentId: currentProject,
  includeProjectRoot: false 
});

// ❌ Avoid querying all tasks unnecessarily
await listTasks({}); // Returns everything
```

### Smart Context Management
- Add context incrementally as you work
- Use specific contextType values for better organization
- Keep descriptions focused and actionable
- Reference specific files, functions, or decisions

### Dependency Management
- Create dependencies early to prevent blocking situations
- Use `getNextTask` to find unblocked work automatically
- Consider task ordering when creating batches

---

## 🎨 Example Workflows

### Feature Development Workflow
```typescript
// 1. Get next high-priority task
const task = await getNextTask({ priority: "high" });

// 2. Break it down if complex
if (isComplexTask(task)) {
  await addTasks({
    tasks: [
      { title: "Research phase", parentIndex: null },
      { title: "Design phase", parentIndex: 0, dependsOn: [0] },
      { title: "Implementation phase", parentIndex: 0, dependsOn: [1] },
      { title: "Testing phase", parentIndex: 0, dependsOn: [2] }
    ]
  });
}

// 3. Start work and document approach
await updateStatus({ taskId: task.id, status: "in-progress" });
await addTaskContext({
  taskId: task.id,
  title: "Development Approach",
  description: "Using TDD approach. Will start with unit tests, then implement feature, then integration tests.",
  contextType: "implementation"
});
```

### Bug Fix Workflow  
```typescript
// 1. Create bug fix task
await addTasks({
  tasks: [{
    title: "Fix login timeout bug",
    description: "Users experiencing timeouts after 5 minutes of inactivity. Need to investigate session management.",
    priority: "high",
    status: "in-progress"
  }]
});

// 2. Document investigation findings
await addTaskContext({
  taskId: newTask.id,
  title: "Bug Investigation Results",
  description: "Root cause: JWT expiry set to 5 minutes instead of 30. Located in auth.config.js line 23. Fix: update JWT_EXPIRY constant.",
  contextType: "research"
});

// 3. Document fix and complete
await addTaskContext({
  taskId: newTask.id,
  title: "Fix Implementation",
  description: "Updated JWT_EXPIRY from '5m' to '30m'. Added env variable for configuration. Tested with manual session timeout.",
  contextType: "implementation"
});

await updateStatus({ taskId: newTask.id, status: "done" });
```

---

## 🔗 Integration Points

### With AGENTS.md
- **AGENTS.md**: Comprehensive developer onboarding, architecture, tools
- **astrotask.md**: Agent-specific workflows, MCP functions, patterns

### With Project Documentation
- Link context slices to relevant documentation
- Reference specific files, functions, or architectural decisions
- Use task hierarchy to mirror project structure

### With Development Tools
- Use astrotask with CLI: `astrotask task list`, `astrotask task next`
- Integrate with Cursor IDE via MCP configuration
- Leverage ElectricSQL for offline-first development

---

## 🏆 Success Patterns

### Effective Task Management
1. **Start Small**: Break large tasks into 2-8 hour chunks
2. **Document Decisions**: Use context slices to capture "why" not just "what"
3. **Manage Dependencies**: Create clear dependency chains
4. **Status Hygiene**: Keep task statuses current and accurate

### Quality Context
1. **Be Specific**: Include file names, line numbers, function names
2. **Show Impact**: Explain consequences of decisions
3. **Include Examples**: Code snippets, command examples, test cases
4. **Link Related Work**: Reference related tasks, docs, or external resources

### Collaboration Ready
1. **Clear Descriptions**: Write for humans who might read later
2. **Consistent Patterns**: Use similar structure across similar tasks
3. **Progress Visibility**: Regular status updates and context additions
4. **Knowledge Transfer**: Capture tribal knowledge in context slices

---

**Remember**: Astrotask is your navigation tool. Use it to stay oriented, document your journey, and help others follow in your footsteps. 🌌 