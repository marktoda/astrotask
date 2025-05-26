/**
 * Logger Usage Examples for Astrolabe
 * 
 * This file demonstrates various ways to use the pino logging implementation
 * across the codebase. These patterns provide clean, concise logging that
 * adapts to different environments automatically.
 */

import {
  createModuleLogger,
  createOperationLogger,
  createRequestLogger,
  createDatabaseLogger,
  startTimer,
  logError,
  logShutdown,
} from '../../src/utils/logger.js';

// ================================
// 1. Basic Module Logging
// ================================

export class TaskManager {
  private logger = createModuleLogger('TaskManager');

  async createTask(title: string, description: string) {
    this.logger.info('Creating new task', { title, description });
    
    try {
      // Simulate task creation
      const taskId = Math.random().toString(36).substring(7);
      
      this.logger.info('Task created successfully', {
        taskId,
        title,
        status: 'pending',
      });
      
      return { id: taskId, title, description, status: 'pending' };
    } catch (error) {
      logError(this.logger, error as Error, { 
        operation: 'createTask',
        title,
      });
      throw error;
    }
  }

  async deleteTask(taskId: string) {
    this.logger.warn('Deleting task', { taskId });
    // Implementation here...
  }
}

// ================================
// 2. Operation-Specific Logging
// ================================

export class AuthService {
  async authenticateUser(email: string, password: string) {
    const logger = createOperationLogger('userAuthentication', { email });
    
    logger.debug('Starting authentication process');
    
    try {
      // Simulate authentication
      const isValid = password.length > 6; // Simple validation
      
      if (isValid) {
        logger.info('Authentication successful', {
          method: 'email_password',
          loginTime: new Date().toISOString(),
        });
        return { success: true, userId: 'user-123' };
      } else {
        logger.warn('Authentication failed - invalid credentials');
        return { success: false, error: 'Invalid credentials' };
      }
    } catch (error) {
      logError(logger, error as Error, { 
        email,
        operation: 'authentication',
      });
      throw error;
    }
  }
}

// ================================
// 3. Performance Timing
// ================================

export class DataProcessor {
  private logger = createModuleLogger('DataProcessor');

  async processLargeDataset(data: unknown[]) {
    const endTimer = startTimer(this.logger, 'processLargeDataset');
    
    try {
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 100));
      const processedItems = data.length;
      
      endTimer({ 
        itemsProcessed: processedItems,
        success: true,
      });
      
      return { processed: processedItems };
    } catch (error) {
      endTimer({ 
        success: false,
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

// ================================
// 4. HTTP Request/Response Logging
// ================================

export class APIHandler {
  private logger = createModuleLogger('API');

  async handleUserRequest(requestId: string, method: string, path: string) {
    const { logRequest, logResponse } = createRequestLogger(this.logger, requestId);
    
    logRequest(method, path, {
      userAgent: 'test-client/1.0',
      ip: '127.0.0.1',
    });
    
    try {
      // Simulate request processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      logResponse(200, {
        responseTime: '50ms',
        bodySize: 1024,
      });
      
      return { status: 200, data: { message: 'Success' } };
    } catch (error) {
      logResponse(500, {
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

// ================================
// 5. Database Operations
// ================================

export class UserRepository {
  private logger = createModuleLogger('UserRepository');
  private db = createDatabaseLogger(this.logger);

  async getUserById(id: string) {
    // This will log the SQL query in debug mode
    this.db.logQuery('SELECT * FROM users WHERE id = ?', [id]);
    
    try {
      // Simulate database query
      await new Promise(resolve => setTimeout(resolve, 10));
      return { id, name: 'John Doe', email: 'john@example.com' };
    } catch (error) {
      logError(this.logger, error as Error, { 
        operation: 'getUserById',
        userId: id,
      });
      throw error;
    }
  }

  async updateUserProfile(userId: string, profileData: Record<string, unknown>) {
    return this.db.logTransaction('updateUserProfile', () => {
      // All operations inside this function will be tracked
      this.logger.debug('Updating user profile', { userId, fields: Object.keys(profileData) });
      
      // Simulate database operations
      this.db.logQuery('UPDATE users SET ? WHERE id = ?', [profileData, userId]);
      this.db.logQuery('INSERT INTO audit_log (user_id, action) VALUES (?, ?)', [userId, 'profile_update']);
      
      return { success: true, userId };
    }, { userId, fields: Object.keys(profileData) });
  }
}

// ================================
// 6. Error Handling Patterns
// ================================

export class FileProcessor {
  private logger = createModuleLogger('FileProcessor');

  async processFile(filePath: string) {
    this.logger.info('Starting file processing', { filePath });
    
    try {
      // Simulate file processing that might fail
      if (filePath.includes('invalid')) {
        throw new Error('Invalid file format');
      }
      
      this.logger.info('File processed successfully', { 
        filePath,
        linesProcessed: 100,
      });
      
      return { success: true, linesProcessed: 100 };
    } catch (error) {
      // Use logError for consistent error logging with context
      logError(this.logger, error as Error, {
        operation: 'processFile',
        filePath,
        stage: 'processing',
      });
      
      // Re-throw if needed or handle gracefully
      throw error;
    }
  }
}

// ================================
// 7. Application Lifecycle
// ================================

export class Application {
  private logger = createModuleLogger('Application');

  async start() {
    this.logger.info('Application starting', {
      version: '0.1.0',
      environment: process.env.NODE_ENV || 'development',
    });

    // Set up graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  private setupShutdownHandlers() {
    const handleShutdown = (signal: string) => {
      logShutdown(this.logger, signal, async () => {
        this.logger.info('Closing database connections...');
        // await database.close();
        
        this.logger.info('Stopping HTTP server...');
        // await server.close();
        
        this.logger.info('Cleanup completed');
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  }
}

// ================================
// 8. Simple Usage Examples
// ================================

// For quick one-off logging in any module:
const logger = createModuleLogger('ExampleModule');

export function quickExample() {
  // Basic logging with context
  logger.info('Operation completed', { 
    userId: '123', 
    operation: 'data_sync',
    duration: '2.5s',
  });

  // Warning with structured data
  logger.warn('Rate limit approaching', {
    currentRequests: 95,
    limit: 100,
    timeWindow: '1min',
  });

  // Error logging
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    logError(logger, error as Error, { 
      context: 'example_function',
      timestamp: Date.now(),
    });
  }
}

// ================================
// Usage Instructions:
// ================================

/*
To use this logging system in your code:

1. Import the logger functions you need:
   import { createModuleLogger, logError } from '../../src/utils/logger.js';

2. Create a logger for your module/class:
   const logger = createModuleLogger('YourModuleName');

3. Use structured logging with context:
   logger.info('User action', { userId, action: 'login', ip });

4. For errors, use logError for consistency:
   logError(logger, error, { operation: 'saveData', userId });

5. For performance tracking:
   const endTimer = startTimer(logger, 'operationName');
   // ... do work ...
   endTimer({ result: 'success' });

The logger automatically adapts to your environment:
- Development: Pretty-printed, colorized output
- Production: JSON output for log aggregation
- Test: Minimal output to reduce noise

Log levels are controlled by the LOG_LEVEL config setting.
*/ 