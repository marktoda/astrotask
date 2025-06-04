# Use Node.js 18 with Alpine for smaller image size
FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm@latest

# Set working directory
WORKDIR /app

# Copy package configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY tsconfig.json biome.json ./

# Build the workspace
RUN pnpm build

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Expose port for HTTP MCP server
EXPOSE 3000

# Set environment variables
ENV DATABASE_PATH=/app/data/astrotask.db
ENV NODE_ENV=production

# Start the MCP server
CMD ["node", "packages/mcp/dist/index.js"] 