/**
 * Request tracking utilities for MCP protocol monitoring
 */
import logger from '../debug-logger.js';

// Track active requests and their states
export const activeRequests = new Map<string | number, {
  id: string | number;
  method: string;
  startTime: number;
  parameters?: any;
}>();

let requestCounter = 0;

/**
 * Generate unique request identifier
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

/**
 * Log MCP request start with detailed information
 */
export function logMcpRequestStart(requestId: string | number, method: string, parameters?: any, serverStartTime?: number): void {
  const requestInfo = {
    id: requestId,
    method,
    startTime: Date.now(),
    parameters
  };
  
  activeRequests.set(requestId, requestInfo);
  
  logger.info('mcp_request', `📥 MCP request started: ${method}`, {
    requestId,
    method,
    parametersSize: parameters ? JSON.stringify(parameters).length : 0,
    activeRequestCount: activeRequests.size,
    uptime: serverStartTime ? Date.now() - serverStartTime : undefined
  });
  
  // Log parameter details if debug level
  if (parameters) {
    logger.debug('mcp_request_params', `Request parameters for ${method}`, {
      requestId,
      parameters
    });
  }
}

/**
 * Log MCP request completion with timing and result information
 */
export function logMcpRequestEnd(requestId: string | number, success: boolean, resultSize?: number, error?: any, serverStartTime?: number): void {
  const requestInfo = activeRequests.get(requestId);
  if (!requestInfo) {
    logger.warn('mcp_request', `Request ${requestId} not found in active requests map`);
    return;
  }
  
  const duration = Date.now() - requestInfo.startTime;
  activeRequests.delete(requestId);
  
  if (success) {
    logger.info('mcp_request', `✅ MCP request completed: ${requestInfo.method}`, {
      requestId,
      method: requestInfo.method,
      duration,
      resultSize: resultSize || 0,
      activeRequestCount: activeRequests.size,
      uptime: serverStartTime ? Date.now() - serverStartTime : undefined
    });
  } else {
    logger.error('mcp_request', `❌ MCP request failed: ${requestInfo.method}`, {
      requestId,
      method: requestInfo.method,
      duration,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      activeRequestCount: activeRequests.size,
      uptime: serverStartTime ? Date.now() - serverStartTime : undefined
    });
  }
  
  // Log performance warnings
  if (duration > 5000) {
    logger.warn('mcp_performance', `Slow request detected: ${requestInfo.method} took ${duration}ms`, {
      requestId,
      method: requestInfo.method,
      duration
    });
  }
}

/**
 * Wrapper function for tool handlers to add request tracking
 */
export function withRequestTracking<T extends Record<string, any>>(
  toolName: string,
  handler: (args: T) => Promise<any>,
  serverStartTime?: number
): (args: T) => Promise<any> {
  return async (args: T) => {
    const requestId = generateRequestId();
    
    try {
      logMcpRequestStart(requestId, toolName, args, serverStartTime);
      
      const result = await handler(args);
      const resultSize = result.content ? 
        JSON.stringify(result.content).length : 
        JSON.stringify(result).length;
      
      logMcpRequestEnd(requestId, true, resultSize, undefined, serverStartTime);
      return result;
      
    } catch (error) {
      logMcpRequestEnd(requestId, false, 0, error, serverStartTime);
      throw error;
    }
  };
}
