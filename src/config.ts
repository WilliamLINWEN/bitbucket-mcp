import { z } from 'zod';

/**
 * Configuration schema for the Bitbucket MCP server
 */
const configSchema = z.object({
  // Authentication
  username: z.string().optional(),
  appPassword: z.string().optional(),
  
  // API settings
  baseUrl: z.string().url().default('https://api.bitbucket.org/2.0'),
  timeout: z.number().min(1000).max(60000).default(30000),
  retryAttempts: z.number().min(0).max(5).default(3),
  retryDelay: z.number().min(100).max(5000).default(1000),
  
  // Rate limiting
  rateLimitRequests: z.number().min(1).max(10000).default(1000),
  rateLimitWindow: z.number().min(1000).max(3600000).default(3600000), // 1 hour
  
  // Performance
  enableMetrics: z.boolean().default(true),
  maxConcurrentRequests: z.number().min(1).max(100).default(10),
  
  // Logging
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  enableRequestLogging: z.boolean().default(false),
  
  // Features
  enableCache: z.boolean().default(false),
  cacheMaxAge: z.number().min(60).max(3600).default(300), // 5 minutes
  cacheMaxSize: z.number().min(10).max(1000).default(100),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Configuration manager for the Bitbucket MCP server
 */
class ConfigManager {
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from environment variables and defaults
   */
  private loadConfig(): Config {
    const envConfig = {
      username: process.env.BITBUCKET_USERNAME,
      appPassword: process.env.BITBUCKET_APP_PASSWORD,
      baseUrl: process.env.BITBUCKET_BASE_URL,
      timeout: process.env.BITBUCKET_TIMEOUT ? parseInt(process.env.BITBUCKET_TIMEOUT, 10) : undefined,
      retryAttempts: process.env.BITBUCKET_RETRY_ATTEMPTS ? parseInt(process.env.BITBUCKET_RETRY_ATTEMPTS, 10) : undefined,
      retryDelay: process.env.BITBUCKET_RETRY_DELAY ? parseInt(process.env.BITBUCKET_RETRY_DELAY, 10) : undefined,
      rateLimitRequests: process.env.BITBUCKET_RATE_LIMIT_REQUESTS ? parseInt(process.env.BITBUCKET_RATE_LIMIT_REQUESTS, 10) : undefined,
      rateLimitWindow: process.env.BITBUCKET_RATE_LIMIT_WINDOW ? parseInt(process.env.BITBUCKET_RATE_LIMIT_WINDOW, 10) : undefined,
      enableMetrics: process.env.BITBUCKET_ENABLE_METRICS ? process.env.BITBUCKET_ENABLE_METRICS === 'true' : undefined,
      maxConcurrentRequests: process.env.BITBUCKET_MAX_CONCURRENT ? parseInt(process.env.BITBUCKET_MAX_CONCURRENT, 10) : undefined,
      logLevel: process.env.BITBUCKET_LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug',
      enableRequestLogging: process.env.BITBUCKET_ENABLE_REQUEST_LOGGING ? process.env.BITBUCKET_ENABLE_REQUEST_LOGGING === 'true' : undefined,
      enableCache: process.env.BITBUCKET_ENABLE_CACHE ? process.env.BITBUCKET_ENABLE_CACHE === 'true' : undefined,
      cacheMaxAge: process.env.BITBUCKET_CACHE_MAX_AGE ? parseInt(process.env.BITBUCKET_CACHE_MAX_AGE, 10) : undefined,
      cacheMaxSize: process.env.BITBUCKET_CACHE_MAX_SIZE ? parseInt(process.env.BITBUCKET_CACHE_MAX_SIZE, 10) : undefined,
    };

    try {
      return configSchema.parse(envConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Configuration validation error:');
        error.errors.forEach(err => {
          console.error(`  ${err.path.join('.')}: ${err.message}`);
        });
        throw new Error('Invalid configuration');
      }
      throw error;
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): Config {
    return { ...this.config };
  }

  /**
   * Get a specific configuration value
   */
  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  /**
   * Check if authentication is configured
   */
  isAuthenticationConfigured(): boolean {
    return !!(this.config.username && this.config.appPassword);
  }

  /**
   * Validate the current configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check authentication
    if (!this.isAuthenticationConfigured()) {
      errors.push('Authentication not configured. Set BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD environment variables.');
    }

    // Check rate limiting configuration
    if (this.config.rateLimitRequests > 5000) {
      errors.push('Rate limit too high. Bitbucket API has limits around 1000 requests per hour for authenticated users.');
    }

    // Check timeout configuration
    if (this.config.timeout < 5000) {
      console.warn('Timeout is set very low, may cause unnecessary failures for slow requests.');
    }

    // Check retry configuration
    if (this.config.retryAttempts > 3) {
      console.warn('High retry attempts may cause delays. Consider using exponential backoff.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get configuration summary for debugging
   */
  getSummary(): Record<string, any> {
    const summary = { ...this.config };
    
    // Hide sensitive information
    if (summary.username) {
      summary.username = summary.username.substring(0, 3) + '***';
    }
    if (summary.appPassword) {
      summary.appPassword = '***';
    }

    return summary;
  }

  /**
   * Update configuration at runtime (useful for testing)
   */
  updateConfig(updates: Partial<Config>): void {
    const newConfig = { ...this.config, ...updates };
    
    try {
      this.config = configSchema.parse(newConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid configuration update: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }
}

// Create global configuration manager instance
export const configManager = new ConfigManager();

/**
 * Environment validation helper
 */
export function validateEnvironment(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required environment variables
  if (!process.env.BITBUCKET_USERNAME) {
    errors.push('BITBUCKET_USERNAME environment variable is required for authentication');
  }

  if (!process.env.BITBUCKET_APP_PASSWORD) {
    errors.push('BITBUCKET_APP_PASSWORD environment variable is required for authentication');
  }

  // Optional but recommended
  if (!process.env.BITBUCKET_LOG_LEVEL) {
    warnings.push('BITBUCKET_LOG_LEVEL not set, using default: info');
  }

  // Validate numeric environment variables
  const numericEnvVars = [
    'BITBUCKET_TIMEOUT',
    'BITBUCKET_RETRY_ATTEMPTS',
    'BITBUCKET_RETRY_DELAY',
    'BITBUCKET_RATE_LIMIT_REQUESTS',
    'BITBUCKET_RATE_LIMIT_WINDOW',
    'BITBUCKET_MAX_CONCURRENT',
    'BITBUCKET_CACHE_MAX_AGE',
    'BITBUCKET_CACHE_MAX_SIZE',
  ];

  for (const envVar of numericEnvVars) {
    const value = process.env[envVar];
    if (value && isNaN(parseInt(value, 10))) {
      errors.push(`${envVar} must be a valid number, got: ${value}`);
    }
  }

  // Validate boolean environment variables
  const booleanEnvVars = [
    'BITBUCKET_ENABLE_METRICS',
    'BITBUCKET_ENABLE_REQUEST_LOGGING',
    'BITBUCKET_ENABLE_CACHE',
  ];

  for (const envVar of booleanEnvVars) {
    const value = process.env[envVar];
    if (value && !['true', 'false'].includes(value.toLowerCase())) {
      errors.push(`${envVar} must be 'true' or 'false', got: ${value}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
