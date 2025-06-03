/**
 * Error Context Enhancement System for Bitbucket MCP Server
 * 
 * This module provides comprehensive error logging with:
 * - Full stack traces
 * - Error categorization (network, timeout, protocol, application)
 * - Error frequency and pattern tracking
 * - Context preservation (what was happening when error occurred)
 * - Error correlation across system components
 */

import logger from './debug-logger.js';

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  PROTOCOL = 'protocol',
  APPLICATION = 'application',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  RATE_LIMIT = 'rate_limit',
  UNKNOWN = 'unknown'
}

/**
 * Severity levels for errors
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error context information
 */
export interface ErrorContext {
  // What was happening when the error occurred
  operation: string;
  component: string;
  tool?: string;
  endpoint?: string;
  userId?: string;
  requestId?: string;
  
  // Request context
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  payload?: any;
  
  // System state
  memoryUsage?: NodeJS.MemoryUsage;
  timestamp: number;
  processId: number;
  
  // Additional metadata
  metadata?: Record<string, any>;
}

/**
 * Enhanced error information
 */
export interface EnhancedError {
  // Core error info
  id: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  
  // Stack trace and source
  stack?: string;
  cause?: string;
  
  // Context
  context: ErrorContext;
  
  // Timing
  timestamp: number;
  duration?: number;
  
  // Correlation
  correlationId?: string;
  parentErrorId?: string;
  
  // Frequency tracking
  occurrenceCount: number;
  firstOccurrence: number;
  lastOccurrence: number;
  
  // Resolution status
  resolved: boolean;
  resolution?: string;
}

/**
 * Error pattern for tracking recurring issues
 */
export interface ErrorPattern {
  id: string;
  signature: string; // Unique signature based on error type and context
  category: ErrorCategory;
  frequency: number;
  firstSeen: number;
  lastSeen: number;
  examples: string[]; // Error IDs of examples
  trend: 'increasing' | 'decreasing' | 'stable';
}

/**
 * Error correlation tracking
 */
export interface ErrorCorrelation {
  id: string;
  errors: string[]; // Error IDs
  component: string;
  timeWindow: number;
  pattern: string;
  impact: 'low' | 'medium' | 'high';
}

/**
 * Error Context Manager - Central error tracking and enhancement system
 */
class ErrorContextManager {
  private errors: Map<string, EnhancedError> = new Map();
  private patterns: Map<string, ErrorPattern> = new Map();
  private correlations: Map<string, ErrorCorrelation> = new Map();
  private errorCounter = 0;
  
  // Configuration
  private readonly maxErrorHistory = 10000;
  private readonly patternDetectionWindow = 3600000; // 1 hour
  private readonly correlationWindow = 300000; // 5 minutes
  
  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${++this.errorCounter}`;
  }
  
  /**
   * Generate error signature for pattern detection
   */
  private generateErrorSignature(error: Error, context: ErrorContext): string {
    const errorType = error.constructor.name;
    const message = error.message.replace(/\d+/g, 'N').replace(/[a-f0-9-]{8,}/gi, 'ID');
    return `${errorType}:${context.component}:${context.operation}:${message}`;
  }
  
  /**
   * Categorize error based on type and context
   */
  private categorizeError(error: Error, context: ErrorContext): ErrorCategory {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';
    
    // Network-related errors
    if (message.includes('network') || 
        message.includes('connection') || 
        message.includes('fetch') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        context.endpoint && (message.includes('502') || message.includes('503'))) {
      return ErrorCategory.NETWORK;
    }
    
    // Timeout errors
    if (message.includes('timeout') || 
        message.includes('aborted') ||
        error.name === 'AbortError') {
      return ErrorCategory.TIMEOUT;
    }
    
    // Protocol errors (HTTP errors)
    if (context.endpoint && (
        message.includes('401') || message.includes('403') || 
        message.includes('404') || message.includes('400'))) {
      return ErrorCategory.PROTOCOL;
    }
    
    // Authentication errors
    if (message.includes('unauthorized') || 
        message.includes('authentication') || 
        message.includes('401')) {
      return ErrorCategory.AUTHENTICATION;
    }
    
    // Validation errors
    if (message.includes('validation') || 
        message.includes('invalid') || 
        stack.includes('zod')) {
      return ErrorCategory.VALIDATION;
    }
    
    // Rate limiting
    if (message.includes('rate limit') || 
        message.includes('429') ||
        error.name === 'RateLimitError') {
      return ErrorCategory.RATE_LIMIT;
    }
    
    // Application errors (everything else)
    return ErrorCategory.APPLICATION;
  }
  
  /**
   * Determine error severity
   */
  private determineSeverity(error: Error, category: ErrorCategory, context: ErrorContext): ErrorSeverity {
    // Critical errors
    if (category === ErrorCategory.AUTHENTICATION || 
        context.operation === 'startup' || 
        error.message.includes('FATAL')) {
      return ErrorSeverity.CRITICAL;
    }
    
    // High severity
    if (category === ErrorCategory.NETWORK || 
        category === ErrorCategory.TIMEOUT || 
        context.component === 'rate-limiter' ||
        context.component === 'bitbucket-api') {
      return ErrorSeverity.HIGH;
    }
    
    // Medium severity
    if (category === ErrorCategory.PROTOCOL || 
        category === ErrorCategory.VALIDATION) {
      return ErrorSeverity.MEDIUM;
    }
    
    // Default to low
    return ErrorSeverity.LOW;
  }
  
  /**
   * Record and enhance an error with full context
   */
  recordError(error: Error, context: ErrorContext, correlationId?: string): EnhancedError {
    const errorId = this.generateErrorId();
    const signature = this.generateErrorSignature(error, context);
    const category = this.categorizeError(error, context);
    const severity = this.determineSeverity(error, category, context);
    
    const enhancedError: EnhancedError = {
      id: errorId,
      message: error.message,
      category,
      severity,
      stack: error.stack,
      cause: error.cause?.toString(),
      context: {
        ...context,
        memoryUsage: process.memoryUsage(),
        timestamp: Date.now(),
        processId: process.pid
      },
      timestamp: Date.now(),
      correlationId,
      occurrenceCount: 1,
      firstOccurrence: Date.now(),
      lastOccurrence: Date.now(),
      resolved: false
    };
    
    // Store the error
    this.errors.set(errorId, enhancedError);
    
    // Update patterns
    this.updateErrorPattern(signature, errorId, category);
    
    // Check for correlations
    this.detectCorrelations(enhancedError);
    
    // Log the enhanced error
    this.logEnhancedError(enhancedError);
    
    // Cleanup old errors if needed
    this.cleanupOldErrors();
    
    return enhancedError;
  }
  
  /**
   * Update error pattern tracking
   */
  private updateErrorPattern(signature: string, errorId: string, category: ErrorCategory): void {
    let pattern = this.patterns.get(signature);
    
    if (!pattern) {
      pattern = {
        id: `pattern_${signature.replace(/[^a-zA-Z0-9]/g, '_')}`,
        signature,
        category,
        frequency: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        examples: [],
        trend: 'stable'
      };
      this.patterns.set(signature, pattern);
    }
    
    // Update pattern
    pattern.frequency++;
    pattern.lastSeen = Date.now();
    pattern.examples.push(errorId);
    
    // Keep only recent examples
    if (pattern.examples.length > 10) {
      pattern.examples = pattern.examples.slice(-10);
    }
    
    // Update trend
    this.updatePatternTrend(pattern);
  }
  
  /**
   * Update pattern trend analysis
   */
  private updatePatternTrend(pattern: ErrorPattern): void {
    const now = Date.now();
    const hourAgo = now - 3600000;
    
    // Count recent occurrences
    const recentErrors = Array.from(this.errors.values())
      .filter(e => e.timestamp > hourAgo && 
                   this.generateErrorSignature(new Error(e.message), e.context) === pattern.signature);
    
    const recentCount = recentErrors.length;
    const expectedRate = pattern.frequency / ((now - pattern.firstSeen) / 3600000);
    
    if (recentCount > expectedRate * 1.5) {
      pattern.trend = 'increasing';
    } else if (recentCount < expectedRate * 0.5) {
      pattern.trend = 'decreasing';
    } else {
      pattern.trend = 'stable';
    }
  }
  
  /**
   * Detect error correlations across components
   */
  private detectCorrelations(error: EnhancedError): void {
    const now = Date.now();
    const windowStart = now - this.correlationWindow;
    
    // Find recent errors in same component
    const recentErrors = Array.from(this.errors.values())
      .filter(e => e.timestamp > windowStart && 
                   e.context.component === error.context.component &&
                   e.id !== error.id);
    
    if (recentErrors.length >= 2) {
      const correlationId = `corr_${error.context.component}_${now}`;
      const errorIds = [error.id, ...recentErrors.map(e => e.id)];
      
      const correlation: ErrorCorrelation = {
        id: correlationId,
        errors: errorIds,
        component: error.context.component,
        timeWindow: this.correlationWindow,
        pattern: `Multiple errors in ${error.context.component}`,
        impact: this.determineCorrelationImpact(errorIds.length, error.severity)
      };
      
      this.correlations.set(correlationId, correlation);
      
      // Update all correlated errors
      errorIds.forEach(id => {
        const err = this.errors.get(id);
        if (err) {
          err.correlationId = correlationId;
        }
      });
    }
  }
  
  /**
   * Determine correlation impact level
   */
  private determineCorrelationImpact(errorCount: number, severity: ErrorSeverity): 'low' | 'medium' | 'high' {
    if (errorCount >= 5 || severity === ErrorSeverity.CRITICAL) {
      return 'high';
    } else if (errorCount >= 3 || severity === ErrorSeverity.HIGH) {
      return 'medium';
    }
    return 'low';
  }
  
  /**
   * Log enhanced error with full context
   */
  private logEnhancedError(error: EnhancedError): void {
    const logData = {
      errorId: error.id,
      category: error.category,
      severity: error.severity,
      operation: error.context.operation,
      component: error.context.component,
      tool: error.context.tool,
      endpoint: error.context.endpoint,
      correlationId: error.correlationId,
      stack: error.stack,
      context: error.context
    };
    
    // Log based on severity
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('error-context', `CRITICAL ERROR: ${error.message}`, logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('error-context', `HIGH SEVERITY: ${error.message}`, logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('error-context', `MEDIUM SEVERITY: ${error.message}`, logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('error-context', `LOW SEVERITY: ${error.message}`, logData);
        break;
    }
  }
  
  /**
   * Cleanup old errors to prevent memory leaks
   */
  private cleanupOldErrors(): void {
    if (this.errors.size <= this.maxErrorHistory) {
      return;
    }
    
    // Sort by timestamp and remove oldest
    const sortedErrors = Array.from(this.errors.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);
    
    const toRemove = sortedErrors.slice(0, sortedErrors.length - this.maxErrorHistory);
    toRemove.forEach(([id]) => this.errors.delete(id));
  }
  
  /**
   * Get error statistics and patterns
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByCategory: Record<ErrorCategory, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    errorsByComponent: Record<string, number>;
    topPatterns: ErrorPattern[];
    activeCorrelations: ErrorCorrelation[];
    trendsAnalysis: {
      increasingPatterns: number;
      criticalErrors: number;
      correlatedErrors: number;
    };
  } {
    const totalErrors = this.errors.size;
    const errorsByCategory: Record<ErrorCategory, number> = {} as any;
    const errorsBySeverity: Record<ErrorSeverity, number> = {} as any;
    const errorsByComponent: Record<string, number> = {};
    
    // Initialize counters
    Object.values(ErrorCategory).forEach(cat => errorsByCategory[cat] = 0);
    Object.values(ErrorSeverity).forEach(sev => errorsBySeverity[sev] = 0);
    
    // Count errors
    this.errors.forEach(error => {
      errorsByCategory[error.category]++;
      errorsBySeverity[error.severity]++;
      
      const component = error.context.component;
      errorsByComponent[component] = (errorsByComponent[component] || 0) + 1;
    });
    
    // Get top patterns
    const topPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
    
    // Get active correlations (recent)
    const now = Date.now();
    const recentWindow = now - 3600000; // 1 hour
    const activeCorrelations = Array.from(this.correlations.values())
      .filter(corr => {
        const recentErrorInCorr = corr.errors.some(errorId => {
          const error = this.errors.get(errorId);
          return error && error.timestamp > recentWindow;
        });
        return recentErrorInCorr;
      });
    
    // Trends analysis
    const increasingPatterns = Array.from(this.patterns.values())
      .filter(p => p.trend === 'increasing').length;
    
    const criticalErrors = Array.from(this.errors.values())
      .filter(e => e.severity === ErrorSeverity.CRITICAL && 
                   e.timestamp > recentWindow).length;
    
    const correlatedErrors = Array.from(this.errors.values())
      .filter(e => e.correlationId && e.timestamp > recentWindow).length;
    
    return {
      totalErrors,
      errorsByCategory,
      errorsBySeverity,
      errorsByComponent,
      topPatterns,
      activeCorrelations,
      trendsAnalysis: {
        increasingPatterns,
        criticalErrors,
        correlatedErrors
      }
    };
  }
  
  /**
   * Get specific error by ID
   */
  getError(errorId: string): EnhancedError | undefined {
    return this.errors.get(errorId);
  }
  
  /**
   * Get recent errors
   */
  getRecentErrors(limit = 50): EnhancedError[] {
    return Array.from(this.errors.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  
  /**
   * Mark error as resolved
   */
  resolveError(errorId: string, resolution: string): boolean {
    const error = this.errors.get(errorId);
    if (error) {
      error.resolved = true;
      error.resolution = resolution;
      logger.info('error-context', `Error resolved: ${errorId}`, { resolution });
      return true;
    }
    return false;
  }
}

// Create singleton instance
const errorContextManager = new ErrorContextManager();

/**
 * Helper function to record an error with context
 */
export function recordError(
  error: Error, 
  operation: string, 
  component: string, 
  additionalContext: Partial<ErrorContext> = {},
  correlationId?: string
): EnhancedError {
  const context: ErrorContext = {
    operation,
    component,
    timestamp: Date.now(),
    processId: process.pid,
    ...additionalContext
  };
  
  return errorContextManager.recordError(error, context, correlationId);
}

/**
 * Helper function to create error context for tool operations
 */
export function createToolErrorContext(
  toolName: string,
  endpoint: string,
  method: string = 'GET',
  additionalContext: Partial<ErrorContext> = {}
): Partial<ErrorContext> {
  return {
    tool: toolName,
    endpoint,
    method,
    component: 'tool-handler',
    operation: `${toolName}-execution`,
    ...additionalContext
  };
}

/**
 * Helper function to create error context for API operations
 */
export function createApiErrorContext(
  endpoint: string,
  method: string,
  additionalContext: Partial<ErrorContext> = {}
): Partial<ErrorContext> {
  return {
    endpoint,
    method,
    component: 'bitbucket-api',
    operation: 'api-request',
    ...additionalContext
  };
}

export { errorContextManager, ErrorContextManager };
export default errorContextManager;
