#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TaskMCPServer } from './server.js';

/**
 * Main entry point for the Astrolabe MCP Server
 * Provides task management capabilities over MCP protocol
 */
async function main() {
  // Create the high-level MCP server instance
  const server = new McpServer({
    name: 'astrolabe-mcp-server',
    version: '0.1.0',
  });

  // Set up our domain-specific implementation and register its tools
  const taskServer = new TaskMCPServer();
  await taskServer.initialize();
  taskServer.register(server);

  // Begin listening on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Astrolabe MCP Server started successfully');
}

// Handle cleanup on process termination
process.on('SIGINT', async () => {
  console.error('Shutting down Astrolabe MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down Astrolabe MCP Server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Fatal error starting Astrolabe MCP Server:', error);
  process.exit(1);
}); 