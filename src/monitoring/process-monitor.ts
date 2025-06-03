/**
 * Process lifecycle monitoring for the Bitbucket MCP server
 */
import logger from '../debug-logger.js';
import { getMemoryInfo, logProcessInfo } from '../utils/memory-utils.js';

// Memory monitoring variables
let memoryCheckInterval: NodeJS.Timeout | null = null;
const MEMORY_WARNING_THRESHOLD = 512 * 1024 * 1024; // 512MB
const MEMORY_CRITICAL_THRESHOLD = 1024 * 1024 * 1024; // 1GB

/**
 * Start periodic memory monitoring
 */
export function startMemoryMonitoring(): void {
  const interval = parseInt(process.env.BITBUCKET_MCP_MEMORY_CHECK_INTERVAL || '30000', 10); // 30 seconds default
  
  memoryCheckInterval = setInterval(() => {
    const memInfo = getMemoryInfo();
    
    if (memInfo.warnings.length > 0) {
      logger.warn('process', 'Memory usage warnings detected', {
        memory: memInfo.formatted,
        warnings: memInfo.warnings,
        raw: memInfo.raw
      });
    } else {
      logger.debug('process', 'Memory check', {
        memory: memInfo.formatted
      });
    }
  }, interval);
  
  logger.info('process', 'Memory monitoring started', { 
    interval: `${interval}ms`,
    warningThreshold: `${MEMORY_WARNING_THRESHOLD / 1024 / 1024}MB`,
    criticalThreshold: `${MEMORY_CRITICAL_THRESHOLD / 1024 / 1024}MB`
  });
}

/**
 * Stop memory monitoring
 */
export function stopMemoryMonitoring(): void {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
    memoryCheckInterval = null;
    logger.debug('process', 'Memory monitoring stopped');
  }
}

/**
 * Set up process signal handlers and lifecycle monitoring
 */
export function setupProcessMonitoring(serverStartTime: number): void {
  // Task 2.1: Add process signal handlers with detailed logging
  process.on('SIGTERM', (signal) => {
    logger.warn('process', 'Received SIGTERM signal - graceful shutdown requested', {
      signal,
      uptime: Date.now() - serverStartTime,
      memory: getMemoryInfo().formatted,
      pid: process.pid
    });
    
    stopMemoryMonitoring();
    
    // Perform graceful shutdown
    logger.info('process', 'Starting graceful shutdown sequence');
    
    // Flush logs before exit
    logger.flush().then(() => {
      logger.info('process', 'Graceful shutdown complete');
      process.exit(0);
    }).catch((err) => {
      logger.error('process', 'Error during graceful shutdown', err);
      process.exit(1);
    });
  });

  process.on('SIGINT', (signal) => {
    logger.warn('process', 'Received SIGINT signal - interrupt requested (Ctrl+C)', {
      signal,
      uptime: Date.now() - serverStartTime,
      memory: getMemoryInfo().formatted,
      pid: process.pid
    });
    
    stopMemoryMonitoring();
    
    // Quick shutdown for interrupt
    logger.info('process', 'Performing interrupt shutdown');
    logger.flush().then(() => {
      process.exit(130);
    }).catch(() => {
      process.exit(130);
    });
  });

  process.on('SIGQUIT', (signal) => {
    logger.error('process', 'Received SIGQUIT signal - quit with core dump requested', {
      signal,
      uptime: Date.now() - serverStartTime,
      memory: getMemoryInfo().formatted,
      pid: process.pid
    });
    
    stopMemoryMonitoring();
    
    // Force quit
    process.exit(131); // Standard exit code for SIGQUIT
  });

  process.on('SIGHUP', (signal) => {
    logger.info('process', 'Received SIGHUP signal - hangup/reload requested', {
      signal,
      uptime: Date.now() - serverStartTime,
      memory: getMemoryInfo().formatted,
      pid: process.pid
    });
    
    // For SIGHUP, we typically reload configuration rather than exit
    // But we'll log it for debugging purposes
    logger.info('process', 'SIGHUP handling: Configuration reload not implemented, continuing operation');
  });

  // Task 2.2: Add process.on('beforeExit') handler to capture exit reasons
  process.on('beforeExit', (code) => {
    const uptime = Date.now() - serverStartTime;
    const memInfo = getMemoryInfo();
    
    logger.warn('process', 'Process is about to exit - beforeExit event', {
      exitCode: code,
      uptime,
      memory: memInfo.formatted,
      memoryWarnings: memInfo.warnings,
      pid: process.pid,
      activeHandles: (process as any)._getActiveHandles?.()?.length || 'unknown',
      activeRequests: (process as any)._getActiveRequests?.()?.length || 'unknown'
    });
    
    // Log timing information
    logger.measure('Total server uptime', 'server_lifecycle_start');
    
    stopMemoryMonitoring();
  });

  // Task 2.3: Add process.on('exit') handler to log final exit code and reason
  process.on('exit', (code) => {
    const uptime = Date.now() - serverStartTime;
    
    // Note: Only synchronous operations are allowed in exit handler
    // We can't use our async logger here, so we use console.error
    const exitMessage = {
      timestamp: new Date().toISOString(),
      event: 'process_exit',
      exitCode: code,
      uptime,
      pid: process.pid,
      memory: process.memoryUsage()
    };
    
    console.error(`[PROCESS-EXIT] ${JSON.stringify(exitMessage)}`);
    
    // Determine exit reason based on code
    let reason = 'unknown';
    switch (code) {
      case 0: reason = 'normal_exit'; break;
      case 1: reason = 'general_error'; break;
      case 2: reason = 'invalid_usage'; break;
      case 130: reason = 'sigint_ctrl_c'; break;
      case 131: reason = 'sigquit'; break;
      case 143: reason = 'sigterm'; break;
      default: reason = `exit_code_${code}`;
    }
    
    console.error(`[PROCESS-EXIT] Server exited with code ${code} (${reason}) after ${uptime}ms uptime`);
  });

  // Task 2.4: Add unhandled rejection and exception handlers
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('process', 'Unhandled Promise rejection - this may cause process termination', {
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack
      } : reason,
      promise: promise.toString(),
      uptime: Date.now() - serverStartTime,
      memory: getMemoryInfo().formatted
    });
    
    // In Node.js future versions, unhandled rejections will terminate the process
    // We'll log this as critical but not force exit to maintain current behavior
  });

  process.on('uncaughtException', (error, origin) => {
    logger.error('process', 'Uncaught exception - process will terminate', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      origin,
      uptime: Date.now() - serverStartTime,
      memory: getMemoryInfo().formatted,
      pid: process.pid
    });
    
    stopMemoryMonitoring();
    
    // Flush logs before forced termination
    logger.flush().then(() => {
      process.exit(1);
    }).catch(() => {
      process.exit(1);
    });
  });

  // Task 2.5: Monitor process warning events
  process.on('warning', (warning) => {
    logger.warn('process', 'Node.js process warning detected', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
      uptime: Date.now() - serverStartTime
    });
  });

  // Task 2.6: Log process startup sequence with timing information
  logger.info('process', 'Process lifecycle monitoring initialized', {
    pid: process.pid,
    startTime: new Date(serverStartTime).toISOString(),
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`
  });

  // Log detailed process information
  logProcessInfo();

  // Start memory monitoring
  startMemoryMonitoring();
  
  // Mark lifecycle start for timing
  logger.mark('server_lifecycle_start');
}
