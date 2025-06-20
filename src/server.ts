import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BitbucketAPI } from "./bitbucket-api.js";
import { MultiTierRateLimiter, createDefaultRateLimitConfig } from "./rate-limiting.js";
import { configManager, validateEnvironment } from "./config.js";
import { metricsCollector } from "./metrics.js";
import { startResourceMonitoring, stopResourceMonitoring } from "./resource-monitor.js";
import { setupProcessMonitoring } from "./monitoring/process-monitor.js";
import { setupProtocolMonitoring } from "./monitoring/protocol-monitor.js";
import { setupTransportMonitoring, setupTransportMessageMonitoring } from "./monitoring/transport-monitor.js";
import { registerTools } from "./tools/index.js";
import logger from "./debug-logger.js";

// Environment variables for authentication
const BITBUCKET_USERNAME = process.env.BITBUCKET_USERNAME;
const BITBUCKET_APP_PASSWORD = process.env.BITBUCKET_APP_PASSWORD;

export async function createServer(): Promise<{ server: McpServer; transport: StdioServerTransport }> {
  // Validate environment on startup
  const envValidation = validateEnvironment();
  logger.info('startup', 'Environment validation completed', {
    valid: envValidation.valid,
    errors: envValidation.errors.length,
    warnings: envValidation.warnings.length
  });

  if (!envValidation.valid) {
    // Record environment validation errors with enhanced error context
    if (envValidation.errors.length > 0) {
      const envError = new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
      logger.error('startup', `Environment validation failed: ${envValidation.errors.length} errors`);
    }
    console.error("Environment validation failed:");
    envValidation.errors.forEach(error => console.error(`  ❌ ${error}`));
    if (envValidation.warnings.length > 0) {
      console.error("Warnings:");
      envValidation.warnings.forEach(warning => console.error(`  ⚠️  ${warning}`));
    }
  }

  // Create rate limiter
  logger.debug('startup', 'Creating rate limiter');
  logger.mark('rate_limiter_start');
  const rateLimiter = new MultiTierRateLimiter(createDefaultRateLimitConfig());
  logger.mark('rate_limiter_done');
  logger.measure('Rate limiter creation time', 'rate_limiter_start');

  // Create Bitbucket API instance
  logger.debug('startup', 'Creating BitbucketAPI instance');
  logger.mark('bitbucket_api_start');
  const bitbucketAPI = new BitbucketAPI(BITBUCKET_USERNAME, BITBUCKET_APP_PASSWORD);
  logger.mark('bitbucket_api_done');
  logger.measure('BitbucketAPI creation time', 'bitbucket_api_start');

  // Create server instance
  logger.debug('startup', 'Creating MCP server instance');
  logger.mark('server_creation_start');
  const server = new McpServer({
    name: "bitbucket-mcp",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
    },
  });
  logger.mark('server_creation_done');
  logger.measure('MCP server creation time', 'server_creation_start');

  // Register all tools
  logger.debug('startup', 'Registering tools');
  logger.mark('tools_registration_start');
  registerTools(server, bitbucketAPI);
  logger.mark('tools_registration_done');
  logger.measure('Tools registration time', 'tools_registration_start');

  // Create transport
  logger.debug('startup', 'Creating transport');
  logger.mark('transport_creation_start');
  const transport = new StdioServerTransport();
  logger.mark('transport_creation_done');
  logger.measure('Transport creation time', 'transport_creation_start');

  return { server, transport };
}

export async function initializeMonitoring(server: McpServer, transport: StdioServerTransport): Promise<void> {
  // Initialize monitoring systems
  logger.debug('startup', 'Initializing monitoring systems');
  logger.mark('monitoring_init_start');
  
  const serverStartTime = Date.now();
  
  setupProcessMonitoring(serverStartTime);
  setupProtocolMonitoring(serverStartTime);
  setupTransportMonitoring(transport, serverStartTime);
  setupTransportMessageMonitoring(transport, serverStartTime);
  startResourceMonitoring();
  
  logger.mark('monitoring_init_done');
  logger.measure('Monitoring initialization time', 'monitoring_init_start');
}

export async function startServer(): Promise<void> {
  try {
    logger.info('startup', 'Starting Bitbucket MCP Server');
    logger.mark('server_startup_start');

    // Create server and transport
    const { server, transport } = await createServer();

    // Initialize monitoring
    await initializeMonitoring(server, transport);

    // Connect server to transport
    logger.debug('startup', 'Connecting server to transport');
    logger.mark('server_connect_start');
    await server.connect(transport);
    logger.mark('server_connect_done');
    logger.measure('Server connection time', 'server_connect_start');

    // Setup connection lifecycle management for clean shutdown
    logger.debug('startup', 'Setting up connection lifecycle management');
    
    // Handle transport close events for cleanup
    const originalOnClose = transport.onclose;
    transport.onclose = () => {
      logger.info('transport', 'Transport connection closed, initiating cleanup');
      
      // Call original close handler if it exists
      if (originalOnClose) {
        originalOnClose();
      }
      
      // Stop resource monitoring to clean up timers
      stopResourceMonitoring();
      
      logger.info('transport', 'Cleanup completed, process should exit cleanly');
      
      // Ensure process exits cleanly after a brief delay to allow log flushing
      setTimeout(() => {
        process.exit(0);
      }, 100);
    };

    // Handle transport errors for cleanup
    const originalOnError = transport.onerror;
    transport.onerror = (error: any) => {
      logger.error('transport', 'Transport error occurred, initiating cleanup', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Call original error handler if it exists
      if (originalOnError) {
        originalOnError(error);
      }
      
      // Stop resource monitoring to clean up timers
      stopResourceMonitoring();
      
      // Exit with error code after cleanup
      setTimeout(() => {
        process.exit(1);
      }, 100);
    };

    // Handle stdio stream end/close events (client disconnect) for cleanup
    const handleStdioClose = () => {
      logger.info('transport', 'Stdio stream ended/closed, initiating cleanup');
      stopResourceMonitoring();
      setTimeout(() => process.exit(0), 100);
    };
    process.stdin.on('end', handleStdioClose);
    process.stdin.on('close', handleStdioClose);

    logger.mark('server_startup_done');
    logger.measure('Total server startup time', 'server_startup_start');
    
    // Calculate startup duration
    const timingInfo = logger.getTimingInfo();
    const startupDuration = timingInfo.marks['server_startup_done'] ? 
      timingInfo.marks['server_startup_done'] - timingInfo.marks['server_startup_start'] : 
      Date.now() - timingInfo.marks['server_startup_start'];
    
    logger.info('startup', 'Bitbucket MCP Server started successfully', {
      startupTime: startupDuration,
      environment: {
        authenticated: !!(BITBUCKET_USERNAME && BITBUCKET_APP_PASSWORD),
        nodeVersion: process.version,
        platform: process.platform
      }
    });

    // Setup process signal handlers for graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info('shutdown', `Received ${signal}, initiating graceful shutdown`);
      stopResourceMonitoring();
      setTimeout(() => {
        logger.info('shutdown', 'Graceful shutdown completed');
        process.exit(0);
      }, 100);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

    // Handle uncaught exceptions and unhandled promise rejections
    process.on('uncaughtException', (error) => {
      logger.error('shutdown', 'Uncaught exception, cleaning up before exit', {
        error: error.message,
        stack: error.stack
      });
      stopResourceMonitoring();
      setTimeout(() => process.exit(1), 100);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('shutdown', 'Unhandled promise rejection, cleaning up before exit', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
      });
      stopResourceMonitoring();
      setTimeout(() => process.exit(1), 100);
    });

    metricsCollector.recordRequest({
      tool: 'server',
      endpoint: 'startup',
      method: 'INIT',
      duration: startupDuration,
      status: 200,
      timestamp: Date.now() - startupDuration,
      success: true
    });

  } catch (error) {
    logger.error('startup', 'Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Cleanup resources before exit
    stopResourceMonitoring();
    
    metricsCollector.recordRequest({
      tool: 'server',
      endpoint: 'startup',
      method: 'INIT',
      duration: 0,
      status: 500,
      timestamp: Date.now(),
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    
    process.exit(1);
  }
}
