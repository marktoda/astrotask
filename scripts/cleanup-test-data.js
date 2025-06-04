#!/usr/bin/env node

/**
 * Workspace-wide cleanup script for test data
 * Removes leftover test databases and temporary files from all packages
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
    
    if (cleaned > 0) {
      console.log(`  ✅ Cleaned ${cleaned} items from ${dir}`);
    } else {
      console.log(`  ✨ No test data found in ${dir}`);
    }
    
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`⚠️  Could not read directory ${dir}:`, error.message);
    }
  }
}

function cleanup() {
  console.log('🚀 Starting workspace-wide test data cleanup...');
  
  // Clean workspace root
  cleanupDirectory(process.cwd());
  
  // Clean all packages
  const packagesDir = join(process.cwd(), 'packages');
  if (existsSync(packagesDir)) {
    try {
      const packages = readdirSync(packagesDir);
      for (const pkg of packages) {
        const pkgDir = join(packagesDir, pkg);
        if (statSync(pkgDir).isDirectory()) {
          cleanupDirectory(pkgDir);
        }
      }
    } catch (error) {
      console.warn('⚠️  Could not read packages directory:', error.message);
    }
  }
  
  console.log('✨ Workspace test data cleanup complete!');
}

// Run cleanup
cleanup(); 