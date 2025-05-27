import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TaskMCPServer } from '../src/server.js';

// Helper to unwrap the `content[0].text` JSON string from callTool responses
function unwrap<T>(response: any): T {
  const text = response.content?.[0]?.text as string;
  return JSON.parse(text) as T;
}

describe('getTaskContext integration', () => {
  const server = new TaskMCPServer();

  beforeAll(async () => {
    await server.initialize();
  });

  afterAll(async () => {
    await server.cleanup();
  });

  it('should return correct ancestors and descendants for a mid-level task', async () => {
    // 1. Create root task
    const rootResp = await server.callTool('createTask', {
      title: 'Root Task',
    });
    const rootTask = unwrap<{ success: boolean; task: { id: string } }>(rootResp).task;

    // 2. Create child task under root
    const childResp = await server.callTool('createTask', {
      title: 'Child Task',
      parentId: rootTask.id,
    });
    const childTask = unwrap<{ success: boolean; task: { id: string } }>(childResp).task;

    // 3. Create grand-child task under child
    const grandResp = await server.callTool('createTask', {
      title: 'Grandchild Task',
      parentId: childTask.id,
    });
    const grandTask = unwrap<{ success: boolean; task: { id: string } }>(grandResp).task;

    // 4. Get context for child task
    const ctxResp = await server.callTool('getTaskContext', {
      id: childTask.id,
      includeAncestors: true,
      includeDescendants: true,
    });
    const ctx = unwrap<{
      task: { id: string };
      ancestors: Array<{ id: string }>;
      descendants: Array<{ id: string }>;
      metadata: { depth: number; totalDescendants: number };
    }>(ctxResp);

    // Assertions
    expect(ctx.task.id).toBe(childTask.id);

    // Ancestors should contain exactly the root task
    expect(ctx.ancestors).toHaveLength(1);
    expect(ctx.ancestors[0].id).toBe(rootTask.id);

    // Descendants should contain exactly the grandchild task
    expect(ctx.descendants).toHaveLength(1);
    expect(ctx.descendants[0].id).toBe(grandTask.id);

    // Metadata checks
    expect(ctx.metadata.depth).toBe(1); // one ancestor level
    expect(ctx.metadata.totalDescendants).toBe(1);
  });
}); 