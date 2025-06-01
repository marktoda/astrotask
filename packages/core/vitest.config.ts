/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // Test file patterns - look in test directory
    include: ['test/**/*.{test,spec}.{js,ts}'],
    // Exclude patterns
    exclude: [
      'node_modules/**',
      'dist/**',
    ],
    // Environment
    environment: 'node',
    testTimeout: 30000,
    globals: true
  },
  resolve: {
    alias: {
      // Allow importing from src using @ alias
      '@': resolve(__dirname, './src')
    }
  }
}) 