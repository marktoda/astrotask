#!/usr/bin/env node

/**
 * Cleanup script for test data
 * Removes leftover test databases and temporary files
 */

import { rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const patterns = [
  'test-data',
  'test.sqlite',
  'test.sqlite-shm',
  'test.sqlite-wal',
  'memory:',
  'data/test-*',
  '*.db-wal',
  '*.db-shm',
];

function cleanupDirectory(dir) {
  console.log(`🧹 Cleaning up test data in: ${dir}`);
  
  try {
    const items = readdirSync(dir);
    let cleaned = 0;
    
    for (const item of items) {
      const itemPath = join(dir, item);
      
      try {
        const stats = statSync(itemPath);
        
        // Check if item matches cleanup patterns
        const shouldClean = patterns.some(pattern => {
          if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(item);
          }
          return item === pattern || item.startsWith(pattern);
        });
        
        if (shouldClean) {
          console.log(`  🗑️  Removing: ${item}`);
          rmSync(itemPath, { recursive: true, force: true });
          cleaned++;
        }
      } catch (error) {
        console.warn(`  ⚠️  Could not stat ${item}:`, error.message);
      }
    }
    
    console.log(`  ✅ Cleaned ${cleaned} items from ${dir}`);
    
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`⚠️  Could not read directory ${dir}:`, error.message);
    }
  }
}

function cleanup() {
  console.log('🚀 Starting test data cleanup...');
  
  // Clean current directory
  cleanupDirectory(process.cwd());
  
  // Clean packages/core directory
  const coreDir = join(process.cwd(), 'packages', 'core');
  if (existsSync(coreDir)) {
    cleanupDirectory(coreDir);
  }
  
  // Clean packages/cli directory  
  const cliDir = join(process.cwd(), 'packages', 'cli');
  if (existsSync(cliDir)) {
    cleanupDirectory(cliDir);
  }
  
  // Clean packages/mcp directory
  const mcpDir = join(process.cwd(), 'packages', 'mcp');
  if (existsSync(mcpDir)) {
    cleanupDirectory(mcpDir);
  }
  
  console.log('✨ Test data cleanup complete!');
}

// Run cleanup
cleanup(); 