/**
 * Performance monitoring and metrics collection for the Bitbucket MCP server
 */

export interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsByTool: Record<string, number>;
  errorsByType: Record<string, number>;
  responseTimesByEndpoint: Record<string, number[]>;
}

export interface RequestMetrics {
  tool: string;
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

class MetricsCollector {
  private metrics: Metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    requestsByTool: {},
    errorsByType: {},
    responseTimesByEndpoint: {},
  };

  private requestHistory: RequestMetrics[] = [];
  private maxHistorySize = 1000;

  /**
   * Record a request with its metrics
   */
  recordRequest(request: RequestMetrics): void {
    this.metrics.totalRequests++;
    
    if (request.success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
      if (request.error) {
        this.metrics.errorsByType[request.error] = (this.metrics.errorsByType[request.error] || 0) + 1;
      }
    }

    // Update tool usage
    this.metrics.requestsByTool[request.tool] = (this.metrics.requestsByTool[request.tool] || 0) + 1;

    // Update response times
    if (!this.metrics.responseTimesByEndpoint[request.endpoint]) {
      this.metrics.responseTimesByEndpoint[request.endpoint] = [];
    }
    this.metrics.responseTimesByEndpoint[request.endpoint].push(request.duration);

    // Calculate average response time
    this.calculateAverageResponseTime();

    // Add to history (with size limit)
    this.requestHistory.push(request);
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  /**
   * Get detailed metrics report
   */
  getDetailedReport(): {
    metrics: Metrics;
    recentRequests: RequestMetrics[];
    endpointStats: Record<string, {
      count: number;
      avgResponseTime: number;
      successRate: number;
    }>;
  } {
    const endpointStats: Record<string, {
      count: number;
      avgResponseTime: number;
      successRate: number;
    }> = {};

    // Calculate endpoint statistics
    for (const request of this.requestHistory) {
      if (!endpointStats[request.endpoint]) {
        endpointStats[request.endpoint] = {
          count: 0,
          avgResponseTime: 0,
          successRate: 0,
        };
      }

      const stats = endpointStats[request.endpoint];
      stats.count++;
      
      // Update average response time
      const oldAvg = stats.avgResponseTime;
      stats.avgResponseTime = (oldAvg * (stats.count - 1) + request.duration) / stats.count;
    }

    // Calculate success rates
    for (const endpoint in endpointStats) {
      const endpointRequests = this.requestHistory.filter(r => r.endpoint === endpoint);
      const successfulRequests = endpointRequests.filter(r => r.success).length;
      endpointStats[endpoint].successRate = successfulRequests / endpointRequests.length;
    }

    return {
      metrics: this.getMetrics(),
      recentRequests: this.requestHistory.slice(-10), // Last 10 requests
      endpointStats,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsByTool: {},
      errorsByType: {},
      responseTimesByEndpoint: {},
    };
    this.requestHistory = [];
  }

  /**
   * Get metrics for a specific time period
   */
  getMetricsForPeriod(startTime: number, endTime: number): RequestMetrics[] {
    return this.requestHistory.filter(
      request => request.timestamp >= startTime && request.timestamp <= endTime
    );
  }

  /**
   * Get performance insights
   */
  getPerformanceInsights(): {
    slowestEndpoints: Array<{ endpoint: string; avgTime: number }>;
    mostUsedTools: Array<{ tool: string; count: number }>;
    commonErrors: Array<{ error: string; count: number }>;
    successRate: number;
    recommendedOptimizations: string[];
  } {
    const insights = {
      slowestEndpoints: [] as Array<{ endpoint: string; avgTime: number }>,
      mostUsedTools: [] as Array<{ tool: string; count: number }>,
      commonErrors: [] as Array<{ error: string; count: number }>,
      successRate: 0,
      recommendedOptimizations: [] as string[],
    };

    // Calculate success rate
    insights.successRate = this.metrics.totalRequests > 0 
      ? this.metrics.successfulRequests / this.metrics.totalRequests 
      : 0;

    // Find slowest endpoints
    for (const [endpoint, times] of Object.entries(this.metrics.responseTimesByEndpoint)) {
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      insights.slowestEndpoints.push({ endpoint, avgTime });
    }
    insights.slowestEndpoints.sort((a, b) => b.avgTime - a.avgTime);
    insights.slowestEndpoints = insights.slowestEndpoints.slice(0, 5);

    // Find most used tools
    for (const [tool, count] of Object.entries(this.metrics.requestsByTool)) {
      insights.mostUsedTools.push({ tool, count });
    }
    insights.mostUsedTools.sort((a, b) => b.count - a.count);
    insights.mostUsedTools = insights.mostUsedTools.slice(0, 5);

    // Find common errors
    for (const [error, count] of Object.entries(this.metrics.errorsByType)) {
      insights.commonErrors.push({ error, count });
    }
    insights.commonErrors.sort((a, b) => b.count - a.count);
    insights.commonErrors = insights.commonErrors.slice(0, 5);

    // Generate optimization recommendations
    if (insights.successRate < 0.95) {
      insights.recommendedOptimizations.push('High error rate detected. Consider implementing better error handling and retry logic.');
    }

    if (this.metrics.averageResponseTime > 2000) {
      insights.recommendedOptimizations.push('High average response time. Consider implementing request caching or connection pooling.');
    }

    if (insights.slowestEndpoints.length > 0 && insights.slowestEndpoints[0].avgTime > 5000) {
      insights.recommendedOptimizations.push(`Endpoint ${insights.slowestEndpoints[0].endpoint} is very slow. Consider optimizing this endpoint.`);
    }

    return insights;
  }

  private calculateAverageResponseTime(): void {
    if (this.requestHistory.length === 0) {
      this.metrics.averageResponseTime = 0;
      return;
    }

    const totalTime = this.requestHistory.reduce((sum, request) => sum + request.duration, 0);
    this.metrics.averageResponseTime = totalTime / this.requestHistory.length;
  }
}

// Create global metrics collector instance
export const metricsCollector = new MetricsCollector();

/**
 * Decorator function to automatically track metrics for API calls
 */
export function trackMetrics(tool: string, endpoint: string) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const method = descriptor.value;
    if (!method) return;

    descriptor.value = async function(this: any, ...args: any[]) {
      const startTime = Date.now();
      let success = false;
      let error: string | undefined;

      try {
        const result = await method.apply(this, args);
        success = true;
        return result;
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : 'Unknown error';
        throw err;
      } finally {
        const duration = Date.now() - startTime;
        metricsCollector.recordRequest({
          tool,
          endpoint,
          method: 'GET', // Default, can be enhanced to detect actual method
          duration,
          status: success ? 200 : 500,
          timestamp: startTime,
          success,
          error,
        });
      }
    } as T;
  };
}
