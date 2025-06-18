#!/usr/bin/env node
/**
 * Test script to verify the new export structure works correctly
 */

async function testExports() {
  console.log('Testing new export structure...\n');

  try {
    // Test main exports
    console.log('✓ Testing main exports (@astrotask/core)');
    const main = await import('./dist/index.js');
    if (!main.Astrotask || !main.TaskService || !main.createAstrotask) {
      throw new Error('Missing essential exports from main module');
    }
    console.log('  - Astrotask, TaskService, createAstrotask found');

    // Test advanced exports
    console.log('✓ Testing advanced exports (@astrotask/core/advanced)');
    const advanced = await import('./dist/advanced.js');
    if (!advanced.DependencyGraph || !advanced.TaskTree || !advanced.Registry) {
      throw new Error('Missing exports from advanced module');
    }
    console.log('  - DependencyGraph, TaskTree, Registry found');

    // Test validation exports
    console.log('✓ Testing validation exports (@astrotask/core/validation)');
    const validation = await import('./dist/validation.js');
    if (!validation.taskSchema || !validation.validateTaskTree) {
      throw new Error('Missing exports from validation module');
    }
    console.log('  - taskSchema, validateTaskTree found');

    // Test tree exports
    console.log('✓ Testing tree exports (@astrotask/core/tree)');
    const tree = await import('./dist/tree.js');
    if (!tree.TaskTree || !tree.TreeTraversal) {
      throw new Error('Missing exports from tree module');
    }
    console.log('  - TaskTree, TreeTraversal found');

    // Test LLM exports
    console.log('✓ Testing LLM exports (@astrotask/core/llm)');
    const llm = await import('./dist/llm.js');
    if (!llm.DefaultLLMService || !llm.ComplexityAnalyzer) {
      throw new Error('Missing exports from LLM module');
    }
    console.log('  - DefaultLLMService, ComplexityAnalyzer found');

    // Test utils exports
    console.log('✓ Testing utils exports (@astrotask/core/utils)');
    const utils = await import('./dist/utils.js');
    if (!utils.createModuleLogger || !utils.generateNextTaskId) {
      throw new Error('Missing exports from utils module');
    }
    console.log('  - createModuleLogger, generateNextTaskId found');

    // Test errors exports
    console.log('✓ Testing errors exports (@astrotask/core/errors)');
    const errors = await import('./dist/errors.js');
    if (!errors.AstrotaskError || !errors.TrackingError) {
      throw new Error('Missing exports from errors module');
    }
    console.log('  - AstrotaskError, TrackingError found');

    console.log('\n🎉 All export tests passed! New structure is working correctly.');
    
    // Show export sizes
    console.log('\n📊 Export comparison:');
    console.log(`Main exports: ${Object.keys(main).length} items`);
    console.log(`Advanced exports: ${Object.keys(advanced).length} items`);
    console.log(`Validation exports: ${Object.keys(validation).length} items`);
    console.log(`Tree exports: ${Object.keys(tree).length} items`);
    console.log(`LLM exports: ${Object.keys(llm).length} items`);
    console.log(`Utils exports: ${Object.keys(utils).length} items`);
    console.log(`Error exports: ${Object.keys(errors).length} items`);

  } catch (error) {
    console.error('❌ Export test failed:', error.message);
    process.exit(1);
  }
}

testExports();