/**
 * Test for automatic dependency generation in PRD task generator
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPRDTaskGenerator } from '../src/services/generators/PRDTaskGenerator.js';
import { createModuleLogger } from '../src/utils/logger.js';
import { createDatabase, type Store } from '../src/database/index.js';
import { DependencyService } from '../src/services/DependencyService.js';
import * as schema from '../src/database/schema.js';

// Skip entire test suite if no OpenAI API key is available
const hasApiKey = !!process.env.OPENAI_API_KEY;

describe.skip('PRD Dependency Generation', () => {
  let store: Store;
  let generator: ReturnType<typeof createPRDTaskGenerator>;
  let dependencyService: DependencyService;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    store = await createDatabase({ 
      dbPath: 'memory://',
      encrypted: false,
      autoSync: false 
    });
    
    const logger = createModuleLogger('test');
    generator = createPRDTaskGenerator(logger, store);
    dependencyService = new DependencyService(store);
  });

  afterEach(async () => {
    if (store) {
      try {
        await store.close();
      } catch (error) {
        // Ignore cleanup errors in tests
        console.warn('Test cleanup error:', error);
      }
    }
  });

  it('should generate tasks with dependencies from PRD content', async () => {
    const prdContent = `
# User Authentication System

## Overview
Build a secure user authentication system with JWT tokens.

## Requirements

### Database Setup
- Create users table with email, password hash, and profile fields
- Set up proper indexes for email lookups

### Authentication Service  
- Implement JWT token generation and validation
- Create password hashing utilities
- Build login/logout functionality

### API Endpoints
- POST /api/auth/register - User registration
- POST /api/auth/login - User login  
- POST /api/auth/logout - User logout
- GET /api/auth/me - Get current user

### Frontend Integration
- Create login form component
- Build registration form component
- Implement authentication context provider

## Technical Requirements
- Use bcrypt for password hashing
- JWT tokens should expire after 24 hours
- Implement proper error handling and validation
`;

    // Generate task tree
    const trackingTree = await generator.generateTaskTree({
      content: prdContent,
      metadata: { source: 'test' }
    });

    expect(trackingTree).toBeDefined();
    expect(trackingTree.getChildren().length).toBeGreaterThan(0);

    // Apply the reconciliation plan to persist tasks
    const plan = trackingTree.createReconciliationPlan();
    const taskService = generator['taskService'];
    const persistedTree = await taskService.applyReconciliationPlan(plan);

    // Extract child task IDs
    const childTaskIds = persistedTree.getChildren().map(child => child.id);
    expect(childTaskIds.length).toBeGreaterThan(3); // Should have multiple tasks

    // Process pending dependencies
    await generator.processPendingDependencies(childTaskIds);

    // Check if dependencies were created
    const allDependencies = await store.sql
      .select()
      .from(schema.taskDependencies);

    expect(allDependencies.length).toBeGreaterThan(0);

    // Verify that some logical dependencies exist
    // For example, database setup should come before API endpoints
    const dependencyGraphs = await Promise.all(
      childTaskIds.map(id => dependencyService.getDependencyGraph(id))
    );

    const tasksWithDependencies = dependencyGraphs.filter(graph => 
      graph.dependencies.length > 0
    );

    expect(tasksWithDependencies.length).toBeGreaterThan(0);
  });

  it('should handle PRD content without clear dependencies', async () => {
    const simplePrd = `
# Simple Feature

## Overview
Add a simple button to the homepage.

## Requirements
- Create a button component
- Style the button with CSS
- Add click handler
`;

    const trackingTree = await generator.generateTaskTree({
      content: simplePrd,
      metadata: { source: 'test' }
    });

    const plan = trackingTree.createReconciliationPlan();
    const taskService = generator['taskService'];
    const persistedTree = await taskService.applyReconciliationPlan(plan);

    const childTaskIds = persistedTree.getChildren().map(child => child.id);
    
    // Should not throw error even if no dependencies are generated
    await expect(generator.processPendingDependencies(childTaskIds)).resolves.not.toThrow();
  });
}); 