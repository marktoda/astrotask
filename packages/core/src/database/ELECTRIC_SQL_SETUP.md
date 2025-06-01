# Electric SQL Setup Guide

## Quick Start

1. **Set up Electric SQL Server**
   ```bash
   # Using Docker
   docker run -p 3000:3000 -e DATABASE_URL=your-postgres-url electricsql/electric
   ```

2. **Configure Astrolabe**
   ```env
   # .env file
   ELECTRIC_URL=http://localhost:3000
   ```

3. **Use the Database**
   ```typescript
   import { createDatabase } from '@astrolabe/core/database';

   // Create a synced database (default)
   const store = await createDatabase();

   // Or explicitly configure
   const store = await createDatabase({
     enableSync: true,
     electricUrl: 'http://localhost:3000',
     syncTables: ['tasks', 'context_slices', 'task_dependencies']
   });
   ```

## API Reference

### createDatabase(options)

Main database creation function with automatic Electric SQL sync.

**Options:**
- `dataDir` - Database file path (default: from config)
- `enableSync` - Enable Electric SQL sync (default: `true`)
- `electricUrl` - Electric SQL server URL (default: from `ELECTRIC_URL` env)
- `syncTables` - Tables to sync (default: `['tasks', 'context_slices', 'task_dependencies']`)
- `enableEncryption` - Enable database encryption (default: `false`)
- `verbose` - Enable verbose logging (default: from config)
- `electricDebug` - Enable Electric sync debug logging (default: `false`)

### createLocalDatabase(dataDir?)

Create a local-only database without sync.

```typescript
const store = await createLocalDatabase('./my-local.db');
```

### createSyncedDatabase(dataDir?, electricUrl?)

Create a database with Electric SQL sync enabled.

```typescript
const store = await createSyncedDatabase('./my-synced.db', 'http://electric.example.com');
```

## How It Works

The implementation leverages the `@electric-sql/pglite-sync` plugin which provides:

1. **Automatic Migration Handling**: The plugin manages schema synchronization automatically
2. **Built-in Retry Logic**: Exponential backoff for connection failures
3. **Persistent Sync State**: Resume sync between sessions
4. **Transactional Consistency**: Multi-table sync maintains consistency
5. **Offline Support**: Works offline and syncs when connection is restored

## Architecture

The simplified architecture uses the SDK's built-in features:

1. **index.ts** - Database factory functions
   - Simple configuration
   - Automatic sync setup
   - Clean API surface

2. **store.ts** - Database operations interface
   - Type-safe CRUD operations
   - Business logic methods
   - Works with or without sync

3. **@electric-sql/pglite-sync** - Handles all sync complexity
   - Migration tracking
   - Connection management
   - Error recovery
   - Status monitoring

## Benefits

- **Simple**: Minimal configuration required
- **Reliable**: Leverages battle-tested SDK features
- **Maintainable**: Uses built-in functionality instead of custom code
- **Fast**: Optimized sync implementation by Electric SQL team

## Troubleshooting

### No Sync Happening
- Check that `ELECTRIC_URL` is set correctly
- Verify Electric SQL server is running
- Enable debug logging with `electricDebug: true`

### Connection Timeout
- Ensure Electric SQL server is accessible
- Check firewall/network settings
- Verify the URL includes the correct port

### Migration Issues
- The SDK handles migration compatibility automatically
- If issues persist, check Electric SQL server logs
- Ensure all clients are using compatible schema versions

## Migration Workflow

1. **Generate Migrations**: `pnpm db:generate`
2. **Electrify Tables**: `pnpm db:electrify` (adds ENABLE ELECTRIC statements)
3. **Apply Locally**: Migrations are applied automatically when creating database
4. **Deploy to Production**: Use Electric SQL's migration proxy for production deployment 