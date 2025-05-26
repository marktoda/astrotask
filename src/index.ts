/**
 * Astrolabe - A local-first, MCP-compatible task-navigation platform
 * Entry point for the application
 */

console.log('Astrolabe initializing...');

export const APP_VERSION = '0.1.0';
export const APP_NAME = 'Astrolabe';

// Test function to verify TypeScript compilation
export function greet(name: string): string {
  return `Hello from ${APP_NAME}, ${name}!`;
}

// Simple test to verify everything compiles
if (import.meta.url === new URL(import.meta.url).href) {
  console.log(greet('Developer'));
  console.log(`Version: ${APP_VERSION}`);
}
