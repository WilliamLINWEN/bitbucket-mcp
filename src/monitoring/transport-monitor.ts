/**
 * Transport connection monitoring for the Bitbucket MCP server
 */
import logger from '../debug-logger.js';
import { getMemoryInfo } from '../utils/memory-utils.js';
import { logMcpNotification, monitorProtocolVersionCompatibility } from './protocol-monitor.js';

/**
 * Setup transport connection monitoring
 */
export function setupTransportMonitoring(transport: any, serverStartTime: number): void {
  logger.debug('transport', 'Setting up transport connection monitoring');
  
  // Monitor transport connection state
  if (transport.onclose) {
    transport.onclose = () => {
      logger.warn('transport', '⚠️  Transport connection closed', {
        uptime: Date.now() - serverStartTime,
        memory: getMemoryInfo().formatted,
        timestamp: new Date().toISOString()
      });
    };
  }
  
  // Monitor transport errors
  if (transport.onerror) {
    transport.onerror = (error: any) => {
      logger.error('transport', '❌ Transport error occurred', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        uptime: Date.now() - serverStartTime,
        memory: getMemoryInfo().formatted,
        timestamp: new Date().toISOString()
      });
    };
  }
  
  // Monitor stdio streams if available
  if (process.stdin) {
    process.stdin.on('error', (error) => {
      logger.error('transport', 'stdin stream error', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        uptime: Date.now() - serverStartTime
      });
    });
   
    process.stdin.on('end', () => {
      logger.warn('transport', 'stdin stream ended - client disconnected', {
        uptime: Date.now() - serverStartTime,
        memory: getMemoryInfo().formatted
      });
    });
    
    process.stdin.on('close', () => {
      logger.warn('transport', 'stdin stream closed', {
        uptime: Date.now() - serverStartTime
      });
    });
  }
  
  if (process.stdout) {
    process.stdout.on('error', (error) => {
      logger.error('transport', 'stdout stream error', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        uptime: Date.now() - serverStartTime
      });
    });
  }
  
  logger.info('transport', 'Transport monitoring setup complete', {
    transportType: 'StdioServerTransport',
    hasOnClose: !!transport.onclose,
    hasOnError: !!transport.onerror,
    stdinReadable: process.stdin?.readable,
    stdoutWritable: process.stdout?.writable
  });
}

/**
 * Enhanced transport message monitoring for notifications
 */
export function setupTransportMessageMonitoring(transport: any, serverStartTime: number): void {
  logger.debug('transport', 'Setting up enhanced transport message monitoring for notifications');

  // Monitor incoming messages for notifications
  const originalOnMessage = transport.onmessage;
  if (originalOnMessage || typeof transport.onmessage !== 'undefined') {
    transport.onmessage = (message: any) => {
      try {
        // Parse JSON-RPC message
        const jsonMessage = typeof message === 'string' ? JSON.parse(message) : message;
        
        // Log client capability negotiation on initialize
        if (jsonMessage.method === 'initialize') {
          logger.info('mcp_client_capabilities', 'Client capability negotiation', {
            capabilities: jsonMessage.params?.capabilities,
            protocolVersion: jsonMessage.params?.protocolVersion,
            clientInfo: jsonMessage.params?.clientInfo
          });
        }

        logger.debug('transport_message', 'Incoming transport message', {
          hasId: 'id' in jsonMessage,
          method: jsonMessage.method,
          messageType: 'id' in jsonMessage ? 'request/response' : 'notification',
          size: JSON.stringify(message).length
        });

        // Handle MCP initialization for protocol version monitoring  
        if (jsonMessage.method === 'initialize' && jsonMessage.params?.protocolVersion) {
          monitorProtocolVersionCompatibility(jsonMessage.params.protocolVersion);
        }

        // Handle notifications (messages without id field)
        if (!('id' in jsonMessage) && jsonMessage.method) {
          logMcpNotification(jsonMessage.method, jsonMessage.params, serverStartTime);
        }

        // Handle error responses that might contain timeout information
        if ('id' in jsonMessage && jsonMessage.error) {
          if (jsonMessage.error.code === -32001) {
            logger.error('mcp_timeout_error', '🚨 TIMEOUT ERROR DETECTED in MCP response', {
              requestId: jsonMessage.id,
              errorCode: jsonMessage.error.code,
              errorMessage: jsonMessage.error.message,
              uptime: Date.now() - serverStartTime
            });
          }
        }

        // Call original handler if it exists
        if (originalOnMessage) {
          return originalOnMessage.call(transport, message);
        }
      } catch (parseError) {
        logger.warn('transport_message', 'Failed to parse incoming message for notification monitoring', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
          messagePreview: typeof message === 'string' ? message.substring(0, 100) : 'Non-string message'
        });
        
        // Call original handler if it exists
        if (originalOnMessage) {
          return originalOnMessage.call(transport, message);
        }
      }
    };
  }

  // Monitor outgoing messages as well
  const originalSend = transport.send;
  if (originalSend) {
    transport.send = (message: any) => {
      try {
        const jsonMessage = typeof message === 'string' ? JSON.parse(message) : message;
        
        logger.debug('transport_message', 'Outgoing transport message', {
          hasId: 'id' in jsonMessage,
          method: jsonMessage.method,
          messageType: 'id' in jsonMessage ? 'request/response' : 'notification',
          size: JSON.stringify(message).length
        });
      } catch (parseError) {
        logger.debug('transport_message', 'Failed to parse outgoing message', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error'
        });
      }
      
      return originalSend.call(transport, message);
    };
  }
}
