#!/usr/bin/env tsx

import { createDatabase } from '../src/database/index.js';
import { TaskService } from '../src/services/TaskService.js';
import type { Store } from '../src/database/store.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function testHierarchicalStatus() {
  // Create test database
  const dbPath = join(tmpdir(), `test-hierarchical-${Date.now()}.db`);
  const store = await createDatabase({ dataDir: dbPath });
  
  try {
    console.log('🧪 Testing Hierarchical Status with CLI Integration\n');
    
    // Create a task hierarchy
    const projectTask = await store.addTask({
      title: 'Build Web App',
      description: 'Complete web application project',
      status: 'pending',
      priority: 'high',
    });
    
    const authFeature = await store.addTask({
      title: 'Authentication System',
      description: 'User login and registration',
      status: 'pending',
      priority: 'high',
      parentId: projectTask.id,
    });
    
    const loginTask = await store.addTask({
      title: 'Login UI',
      description: 'Design and implement login form',
      status: 'pending',
      priority: 'medium',
      parentId: authFeature.id,
    });
    
    const signupTask = await store.addTask({
      title: 'Signup UI',
      description: 'Design and implement signup form',
      status: 'in-progress',
      priority: 'medium',
      parentId: authFeature.id,
    });
    
    console.log('✅ Created task hierarchy:');
    console.log(`   - ${projectTask.title} (${projectTask.status})`);
    console.log(`     - ${authFeature.title} (${authFeature.status})`);
    console.log(`       - ${loginTask.title} (${loginTask.status})`);
    console.log(`       - ${signupTask.title} (${signupTask.status})`);
    console.log('');
    
    // Test TaskService with effective status
    const taskService = new TaskService(store);
    const tree = await taskService.getTaskTree();
    
    if (tree) {
      console.log('🌳 Task tree with effective status:');
      
      tree.walkDepthFirst(node => {
        const actualStatus = node.task.status;
        const effectiveStatus = node.getEffectiveStatus();
        const inherited = actualStatus !== effectiveStatus ? ' (inherited)' : '';
        const indent = '  '.repeat(node.getDepth());
        
        console.log(`${indent}- ${node.title}: ${effectiveStatus}${inherited}`);
      });
      console.log('');
    }
    
    // Test status cascading
    console.log('🔄 Testing status cascading...');
    console.log(`Marking "${projectTask.title}" as done...`);
    
    const cascadeCount = await taskService.updateTreeStatus(projectTask.id, 'done');
    console.log(`✅ Cascaded status to ${cascadeCount} descendant tasks`);
    console.log('');
    
    // Verify the results
    const updatedTree = await taskService.getTaskTree();
    if (updatedTree) {
      console.log('🎯 Final task tree after cascading:');
      
      updatedTree.walkDepthFirst(node => {
        const actualStatus = node.task.status;
        const effectiveStatus = node.getEffectiveStatus();
        const inherited = actualStatus !== effectiveStatus ? ' (inherited)' : '';
        const indent = '  '.repeat(node.getDepth());
        
        console.log(`${indent}- ${node.title}: actual=${actualStatus}, effective=${effectiveStatus}${inherited}`);
      });
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } finally {
    await store.close();
  }
}

// Run the test
testHierarchicalStatus().catch(console.error); 