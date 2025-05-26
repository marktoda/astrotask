/**
 * Astrolabe - A local-first, MCP-compatible task-navigation platform
 * Entry point for the application
 */

// Import centralised configuration
import { cfg } from './config/index.js';

export const APP_VERSION = '0.1.0';
export const APP_NAME = 'Astrolabe';

// Test function to verify TypeScript compilation
export function greet(name: string): string {
  return `Hello, ${name}! Welcome to ${APP_NAME} v${APP_VERSION}`;
}

// Simple test to verify everything compiles
if (import.meta.url === new URL(import.meta.url).href) {
  // Example usage of the configuration in development
  if (cfg.NODE_ENV === 'development') {
    console.info(`Development mode - Environment: ${cfg.NODE_ENV} | Port: ${cfg.PORT}`);
    console.info(greet('Developer'));
    console.info(`Version: ${APP_VERSION}`);
  }
}
