/**
 * Test utilities for database setup and cleanup
 */

import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseStore } from '../src/database/store.js';

/**
 * Robust cleanup function for test databases
 * Handles errors gracefully and ensures cleanup even if store.close() fails
 */
export async function cleanupTestDatabase(store: DatabaseStore | undefined, testDbPath: string): Promise<void> {
  // Try to close the store if it exists
  if (store) {
    try {
      await store.close();
    } catch (error) {
      console.warn('Warning: Failed to close database store during cleanup:', error instanceof Error ? error.message : String(error));
      // Continue with file cleanup even if store.close() fails
    }
  }
  
  // Remove the test database directory/file
  try {
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn('Warning: Failed to remove test database path during cleanup:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Generate a unique test database path to avoid conflicts
 */
export function generateTestDbPath(testName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return join(process.cwd(), 'test-data', `${testName}-${timestamp}-${random}`);
}

/**
 * Cleanup multiple test database paths
 */
export function cleanupTestDatabases(...paths: string[]): void {
  for (const path of paths) {
    try {
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn(`Warning: Failed to cleanup test database at ${path}:`, error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Force cleanup all test-data directories (for use in emergencies)
 */
export function forceCleanupAllTestData(): void {
  const testDataDirs = [
    join(process.cwd(), 'test-data'),
    join(process.cwd(), '..', '..', 'test-data'),
  ];
  
  for (const dir of testDataDirs) {
    try {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
        console.log(`Force cleaned test data directory: ${dir}`);
      }
    } catch (error) {
      console.warn(`Warning: Failed to force cleanup ${dir}:`, error instanceof Error ? error.message : String(error));
    }
  }
} 