# Database Configuration Migration Guide

## Overview

We've simplified Astrolabe's database configuration by consolidating multiple scattered configuration variables into a single, unified approach. This makes the system easier to understand, configure, and maintain.

## What Changed

### Before (Multiple Confusing Variables)
```bash
# Old scattered configuration
DATABASE_URL=./dev.db           # Used only by Drizzle config  
DATA_DIR=./data/astrolabe.db    # Used by core database
DATABASE_PATH=astrolabe.db      # Used by MCP server
DB_DEFAULT_DIR=~/.astrolabe     # Unused
DB_DEFAULT_NAME=astrolabe.db    # Unused
ASTROLABE_DB_KEY=TEST          # Legacy encryption key
# Plus many unused SQLite/SQLCipher configs...
```

### After (Single Source of Truth)
```bash
# New unified configuration
DATABASE_PATH=./data/astrolabe.db  # Used everywhere consistently
DB_VERBOSE=false                   # Database logging
DB_TIMEOUT=5000                    # Database timeout
```

## Migration Steps

### 1. Update Environment Variables

**Replace** any of these old variables:
- `DATABASE_URL` → `DATABASE_PATH`
- `DATA_DIR` → `DATABASE_PATH`

**Remove** these unused variables:
- `ASTROLABE_DB_KEY`
- `DB_DEFAULT_DIR`
- `DB_DEFAULT_NAME`
- `DB_ENCRYPTED`
- `DB_CIPHER`
- `DB_KDF_ITER`
- `DB_PAGE_SIZE`
- `DB_CACHE_SIZE`
- `DB_MMAP_SIZE`
- `DB_JOURNAL_MODE`
- `DB_SYNCHRONOUS`

### 2. Update MCP Configuration

**Before:**
```json
{
  "mcpServers": {
    "astrolabe": {
      "env": {
        "DATABASE_PATH": "astrolabe.db"
      }
    }
  }
}
```

**After:**
```json
{
  "mcpServers": {
    "astrolabe": {
      "env": {
        "DATABASE_PATH": "./data/astrolabe.db"
      }
    }
  }
}
```

### 3. Update Application Code

**Before:**
```typescript
import { cfg } from '@astrolabe/core';

console.log(cfg.DATA_DIR);        // Old variable
console.log(cfg.DATABASE_URL);    // Legacy variable
```

**After:**
```typescript
import { cfg } from '@astrolabe/core';

console.log(cfg.DATABASE_PATH);   // Unified variable
```

### 4. Update Documentation/Scripts

Search your project for references to the old variables and update them:

```bash
# Find old references
grep -r "DATABASE_URL\|DATA_DIR\|ASTROLABE_DB_KEY" .

# Update to use DATABASE_PATH
```

## Benefits of the New Approach

1. **Single Source of Truth**: One variable (`DATABASE_PATH`) controls database location everywhere
2. **Simpler Configuration**: Removed 10+ unused/confusing variables  
3. **Consistent Behavior**: MCP server, core library, and CLI all use the same config
4. **Better Defaults**: Sensible default path (`./data/astrolabe.db`) works everywhere
5. **Easier to Understand**: Clear separation between database location and other settings

## Default Behavior

If you don't specify `DATABASE_PATH`, the system will use `./data/astrolabe.db` by default. This ensures consistent behavior across:

- Core library (`createDatabase()`)
- MCP server
- CLI tools
- Drizzle migrations

## Troubleshooting

### "Database not found" errors
- Check that `DATABASE_PATH` points to the correct location
- Ensure the directory exists (the system will create it if missing)
- Verify file permissions

### Configuration not loading
- Make sure you've removed old environment variables that might conflict
- Check that your `.env` file uses `DATABASE_PATH` instead of old variables
- Restart your application after changing environment variables

## Questions?

If you encounter issues during migration, check:
1. That all old variables are removed from your environment
2. That `DATABASE_PATH` is set correctly
3. That the database directory is writable
4. The application logs for any configuration warnings 