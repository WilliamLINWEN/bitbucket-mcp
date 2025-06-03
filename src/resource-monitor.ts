/**
 * Resource monitoring for Bitbucket MCP Server
 * Monitors CPU, memory, file descriptors, network connections, garbage collection events, and event loop lag.
 */
import { monitorEventLoopDelay, PerformanceObserver, PerformanceEntry, constants } from 'perf_hooks';
import os from 'os';
import process from 'process';
import logger, { LogLevel } from './debug-logger.js';

/**
 * Start periodic resource monitoring.
 * @param intervalMs - Monitoring interval in milliseconds (default: 5000ms)
 */
export function startResourceMonitoring(intervalMs: number = 5000): void {
  // Setup event loop delay monitor
  const eventLoopMonitor = monitorEventLoopDelay({ resolution: 10 });
  eventLoopMonitor.enable();

  // Setup garbage collection event monitoring
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const e = entry as PerformanceEntry & { kind: number };
      const gcType = constants.NODE_PERFORMANCE_GC_MINOR === e.kind ? 'minor' :
                     constants.NODE_PERFORMANCE_GC_MAJOR === e.kind ? 'major' :
                     constants.NODE_PERFORMANCE_GC_INCREMENTAL === e.kind ? 'incremental' :
                     constants.NODE_PERFORMANCE_GC_WEAKCB === e.kind ? 'weakcb' : 'unknown';
      logger.info('resource', 'Garbage Collection event', {
        gcType,
        durationMs: entry.duration
      });
    }
  });
  gcObserver.observe({ entryTypes: ['gc'], buffered: false });
  
  // Track network interfaces (connection states)
  const networkInterfaces = os.networkInterfaces();
  logger.debug('resource', 'Network interfaces', networkInterfaces);

  setInterval(() => {
    try {
      // CPU usage since last call
      const cpuUsage = process.cpuUsage();
      const cpuUserMs = cpuUsage.user / 1000;
      const cpuSystemMs = cpuUsage.system / 1000;

      // Memory usage
      const memory = process.memoryUsage();
      const memoryRss = memory.rss;
      const memoryHeapUsed = memory.heapUsed;
      const memoryHeapTotal = memory.heapTotal;

      // Event loop lag statistics
      const elStats = eventLoopMonitor;
      const eventLoopLagMs = elStats.mean / 1e6; // nanoseconds to milliseconds

      // Active handles and requests (approximate file descriptors)
      const activeHandles = (process as any)._getActiveHandles().length;
      const activeRequests = (process as any)._getActiveRequests().length;
      
      // Network sockets count
      const socketHandles = (process as any)._getActiveHandles().filter((handle: any) => handle.constructor?.name === 'Socket').length;

      // Log structured resource usage
      logger.info('resource', 'Periodic resource usage report', {
        cpuUserMs,
        cpuSystemMs,
        memoryRss,
        memoryHeapUsed,
        memoryHeapTotal,
        eventLoopLagMs,
        activeHandles,
        activeRequests,
        socketHandles
      });

      // Reset event loop stats
      eventLoopMonitor.reset();
    } catch (error: any) {
      logger.error('resource', 'Failed to collect resource metrics', error);
    }
  }, intervalMs);
}
