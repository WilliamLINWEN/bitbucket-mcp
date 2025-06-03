/**
 * Memory monitoring utilities for the Bitbucket MCP server
 */

// Memory monitoring thresholds
const MEMORY_WARNING_THRESHOLD = 512 * 1024 * 1024; // 512MB
const MEMORY_CRITICAL_THRESHOLD = 1024 * 1024 * 1024; // 1GB

/**
 * Get human-readable memory usage information
 */
export function getMemoryInfo(): { formatted: string; raw: NodeJS.MemoryUsage; warnings: string[] } {
  const usage = process.memoryUsage();
  const warnings: string[] = [];
  
  const formatBytes = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)}MB`;
  };
  
  // Check for memory warnings
  if (usage.heapUsed > MEMORY_WARNING_THRESHOLD) {
    warnings.push(`High heap usage: ${formatBytes(usage.heapUsed)}`);
  }
  if (usage.rss > MEMORY_CRITICAL_THRESHOLD) {
    warnings.push(`Critical RSS usage: ${formatBytes(usage.rss)}`);
  }
  
  return {
    formatted: `RSS: ${formatBytes(usage.rss)}, Heap: ${formatBytes(usage.heapUsed)}/${formatBytes(usage.heapTotal)}, External: ${formatBytes(usage.external)}`,
    raw: usage,
    warnings
  };
}

/**
 * Log process information and environment
 */
export function logProcessInfo(): void {
  const memInfo = getMemoryInfo();
  
  logger.info('process', 'Process information at startup', {
    pid: process.pid,
    ppid: process.ppid,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    memory: memInfo.formatted,
    argv: process.argv,
    cwd: process.cwd(),
    uptime: process.uptime()
  });
}

// Import logger (this will be available when the module is used)
import logger from '../debug-logger.js';
