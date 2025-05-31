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
     electricConfig: {
       syncUrl: 'http://localhost:3000',
       tables: ['tasks', 'context_slices']
     }
   });
   ```

## API Reference

### createDatabase(options)

Main database creation function with automatic Electric SQL sync.

**Options:**
- `dataDir` - Database file path (default: `'./data/astrolabe.db'`)
- `enableSync` - Enable Electric SQL sync (default: `true`)
- `electricConfig` - Electric SQL configuration
  - `syncUrl` - Electric SQL server URL
  - `tables` - Tables to sync (default: `['tasks', 'context_slices']`)
  - `verbose` - Enable verbose logging
- `enableEncryption` - Enable database encryption (default: `false`)
- `verbose` - Enable verbose logging (default: from config)

### createLocalDatabase(dataDir?)

Create a local-only database without sync.

```typescript
const store = await createLocalDatabase('./my-local.db');
```

### createSyncedDatabase(dataDir?, electricConfig?)

Create a database with Electric SQL sync enabled.

```typescript
const store = await createSyncedDatabase('./my-synced.db', {
  syncUrl: 'http://electric.example.com'
});
```

## How It Works

1. **Automatic Sync**: When Electric SQL is configured, the database automatically syncs changes bidirectionally with the remote Postgres database.

2. **Offline Support**: Works offline and syncs when connection is restored.

3. **Conflict Resolution**: Uses last-write-wins by default (handled by Electric SQL).

4. **Real-time Updates**: Changes from other clients appear automatically.

## Troubleshooting

### No Sync Happening
- Check that `ELECTRIC_URL` is set correctly
- Verify Electric SQL server is running
- Check logs for connection errors

### Connection Timeout
- Ensure Electric SQL server is accessible
- Check firewall/network settings
- Verify the URL includes the correct port

### Local-Only Mode
If Electric SQL connection fails, the database continues working in local-only mode. Check logs for details.

## Architecture

The simplified architecture consists of:

1. **electric.ts** - Core Electric SQL integration
   - Manages Shape subscriptions
   - Handles data synchronization
   - Minimal, focused implementation

2. **store.ts** - Database operations interface
   - Type-safe CRUD operations
   - Business logic methods
   - Works with or without sync

3. **index.ts** - Factory functions
   - Simple database creation
   - Configuration handling
   - Migration management

## Benefits

- **Simple**: Single environment variable configuration
- **Reliable**: Leverages Electric SQL's built-in features
- **Maintainable**: ~200 lines vs 1000+ lines
- **Fast**: Direct Electric SQL integration without overhead 