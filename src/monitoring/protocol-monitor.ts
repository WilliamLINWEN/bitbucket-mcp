/**
 * MCP protocol monitoring and timeout detection
 */
import logger from '../debug-logger.js';
import { activeRequests } from '../utils/request-tracking.js';
import { metricsCollector } from '../metrics.js';

// Track MCP protocol version for compatibility monitoring
let mcpProtocolVersion: string | null = null;
const supportedProtocolVersions = ['2024-11-05', '2024-10-07', '2024-09-15'];

// Configurable timeout thresholds via environment variables
const REQUEST_TIMEOUT_WARNING = parseInt(process.env.MCP_TIMEOUT_WARNING || '10000', 10); // default 10s
const REQUEST_TIMEOUT_CRITICAL = parseInt(process.env.MCP_TIMEOUT_CRITICAL || '30000', 10); // default 30s

// Track timeouts per method for pattern analysis
const mcpTimeoutCounts = new Map<string, number>();

// Timeout monitoring intervals
let requestTimeoutChecker: NodeJS.Timeout | null = null;
let responseTimeMonitor: NodeJS.Timeout | null = null;

/**
 * Log MCP notification received from client
 */
export function logMcpNotification(method: string, params?: any, serverStartTime?: number): void {
  logger.info('mcp_notification', `📢 MCP notification received: ${method}`, {
    method,
    params: params ? JSON.stringify(params).substring(0, 500) : undefined,
    uptime: serverStartTime ? Date.now() - serverStartTime : undefined,
    timestamp: new Date().toISOString()
  });

  // Special handling for timeout notifications (-32001 error code)
  if (method === 'cancelled' || (params && params.error && params.error.code === -32001)) {
    logger.error('mcp_timeout_notification', '🚨 TIMEOUT NOTIFICATION RECEIVED - This may cause server closure!', {
      method,
      params,
      error: params?.error,
      errorCode: params?.error?.code,
      errorMessage: params?.error?.message,
      uptime: serverStartTime ? Date.now() - serverStartTime : undefined,
      activeRequests: activeRequests.size,
      activeRequestsList: Array.from(activeRequests.values()).map(req => ({
        id: req.id,
        method: req.method,
        duration: Date.now() - req.startTime
      }))
    });
  }

  // Log other error notifications
  if (params && params.error) {
    logger.warn('mcp_error_notification', 'MCP error notification received', {
      method,
      errorCode: params.error.code,
      errorMessage: params.error.message,
      errorData: params.error.data,
      uptime: serverStartTime ? Date.now() - serverStartTime : undefined
    });
  }
}

/**
 * Monitor MCP protocol version compatibility
 */
export function monitorProtocolVersionCompatibility(clientVersion: string): void {
  mcpProtocolVersion = clientVersion;
  
  const isSupported = supportedProtocolVersions.includes(clientVersion);
  
  if (isSupported) {
    logger.info('mcp_protocol_version', '✅ MCP protocol version is supported', {
      clientVersion,
      supportedVersions: supportedProtocolVersions,
      isSupported: true
    });
  } else {
    logger.warn('mcp_protocol_version', '⚠️ MCP protocol version may not be fully supported', {
      clientVersion,
      supportedVersions: supportedProtocolVersions,
      isSupported: false,
      recommendation: 'Consider updating to a supported protocol version'
    });
  }
}

/**
 * Start timeout monitoring for requests
 */
export function startTimeoutMonitoring(serverStartTime: number): void {
  // Set up periodic monitoring for long-running requests
  requestTimeoutChecker = setInterval(() => {
    const now = Date.now();
    
    for (const [requestId, requestInfo] of activeRequests.entries()) {
      const duration = now - requestInfo.startTime;
      
      if (duration > REQUEST_TIMEOUT_CRITICAL) {
        // Increment timeout count for method
        const prevCount = mcpTimeoutCounts.get(requestInfo.method) || 0;
        mcpTimeoutCounts.set(requestInfo.method, prevCount + 1);
        
        logger.error('mcp_timeout', '🚨 Critical timeout detected - request running too long', {
          requestId,
          method: requestInfo.method,
          duration,
          parameters: requestInfo.parameters,
          activeRequestQueueDepth: activeRequests.size,
          uptime: now - serverStartTime
        });
        // Log timeout patterns
        logger.info('timeout_patterns', 'MCP timeout counts by method', {
          timeoutCounts: Array.from(mcpTimeoutCounts.entries())
        });
      } else if (duration > REQUEST_TIMEOUT_WARNING) {
        logger.warn('mcp_timeout', '⏰ Request timeout warning - slow response detected', {
          requestId,
          method: requestInfo.method,
          duration,
          activeRequestQueueDepth: activeRequests.size,
          uptime: now - serverStartTime
        });
      }
    }
  }, 5000); // Check every 5 seconds

  // Periodically log response time distribution and identify slow operations
  const RESPONSE_TIME_MONITOR_INTERVAL = parseInt(process.env.MCP_RESPONSE_TIME_MONITOR_INTERVAL || '60000', 10);
  responseTimeMonitor = setInterval(() => {
    const insights = metricsCollector.getPerformanceInsights();
    logger.info('timeout_debug', 'Response time distribution and slow endpoint analysis', {
      slowestEndpoints: insights.slowestEndpoints,
      recommendedOptimizations: insights.recommendedOptimizations
    });
  }, RESPONSE_TIME_MONITOR_INTERVAL);

  logger.info('mcp_protocol', 'Setting up MCP notification monitoring');
  logger.info('timeout_monitoring', 'Request timeout monitoring started', {
    warningThreshold: REQUEST_TIMEOUT_WARNING,
    criticalThreshold: REQUEST_TIMEOUT_CRITICAL
  });
}

/**
 * Stop timeout monitoring
 */
export function stopTimeoutMonitoring(): void {
  if (requestTimeoutChecker) {
    clearInterval(requestTimeoutChecker);
    requestTimeoutChecker = null;
  }
  if (responseTimeMonitor) {
    clearInterval(responseTimeMonitor);
    responseTimeMonitor = null;
  }
  logger.debug('protocol_monitor', 'Timeout monitoring stopped');
}

/**
 * Initialize protocol monitoring
 */
export function setupProtocolMonitoring(serverStartTime: number): void {
  startTimeoutMonitoring(serverStartTime);
  
  // Clean up intervals on process exit
  process.on('beforeExit', () => {
    stopTimeoutMonitoring();
  });
}
