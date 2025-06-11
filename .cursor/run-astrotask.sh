#!/bin/bash

# Set up environment for local development version
export DATABASE_URI=/home/toda/dev/astrotask/data/astrotask.db

# Ensure data directory exists
mkdir -p "$(dirname "$DATABASE_URI")"

# npx @astrotask/mcp

# Use the local development version instead of published package
# This points to your local astrotask development code
cd /home/toda/dev/astrotask

# Run the MCP server - logging goes to stderr by default
exec node packages/mcp/dist/stdio.js "$@"
