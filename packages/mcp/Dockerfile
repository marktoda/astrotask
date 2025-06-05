# Use Node.js 18 with Alpine for smaller image size
FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm@latest

# Set working directory
WORKDIR /app

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json biome.json ./

# Copy all packages (needed for workspace dependency resolution)
COPY packages/ ./packages/

# Install dependencies (workspace dependencies need source to be present)
RUN pnpm install --no-frozen-lockfile

# Build only the required packages (core and mcp)
RUN pnpm --filter @astrotask/core build
RUN pnpm --filter @astrotask/mcp build

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Expose port for HTTP MCP server
EXPOSE 3000

# Set environment variables
ENV DATABASE_URI=/app/data/astrotask.db
ENV NODE_ENV=production

# Start the MCP server with HTTP transport (for hosted deployment)
CMD ["node", "packages/mcp/dist/http.js"]
