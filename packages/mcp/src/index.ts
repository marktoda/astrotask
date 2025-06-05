#!/usr/bin/env node

/**
 * Astrotask MCP Server Entry Point
 * 
 * This is the main entry point that selects between stdio and HTTP transports
 * based on the ASTROTASK_MCP_TRANSPORT environment variable.
 * 
 * - ASTROTASK_MCP_TRANSPORT=stdio -> Uses stdio transport (local development)
 * - ASTROTASK_MCP_TRANSPORT=http -> Uses HTTP transport (hosted deployment)
 * - Default: stdio transport (for local npx usage)
 */

const transport = process.env.ASTROTASK_MCP_TRANSPORT?.toLowerCase() || 'stdio';

if (transport === 'stdio') {
  // Use stdio transport for local development
  import('./stdio.js').then(module => {
    // stdio.js will execute its main function automatically
  }).catch(error => {
    console.error('Failed to start stdio transport:', error);
    process.exit(1);
  });
} else if (transport === 'http') {
  // Use HTTP transport for hosted deployment
  import('./http.js').then(module => {
    // http.js will execute its main function automatically
  }).catch(error => {
    console.error('Failed to start HTTP transport:', error);
    process.exit(1);
  });
} else {
  console.error(`Unknown transport type: ${transport}. Use 'stdio' or 'http'.`);
  process.exit(1);
}
