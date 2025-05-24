/**
 * Rate limiting implementation for the Bitbucket MCP server
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

/**
 * Token bucket rate limiter implementation
 */
class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(private config: RateLimitConfig) {
    this.maxTokens = config.maxRequests;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.refillRate = this.maxTokens / config.windowMs;
  }

  /**
   * Check if a request is allowed and consume a token if so
   */
  checkLimit(): RateLimitResult {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(this.tokens),
        resetTime: this.getNextResetTime(),
      };
    } else {
      const retryAfter = Math.ceil(1 / this.refillRate);
      return {
        allowed: false,
        remaining: 0,
        resetTime: this.getNextResetTime(),
        retryAfter,
      };
    }
  }

  /**
   * Get current status without consuming a token
   */
  getStatus(): { tokens: number; remaining: number; resetTime: number } {
    this.refillTokens();
    return {
      tokens: this.tokens,
      remaining: Math.floor(this.tokens),
      resetTime: this.getNextResetTime(),
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private getNextResetTime(): number {
    const timeUntilFullRefill = (this.maxTokens - this.tokens) / this.refillRate;
    return Date.now() + timeUntilFullRefill;
  }
}

/**
 * Sliding window rate limiter implementation
 */
class SlidingWindowRateLimiter {
  private requests: number[] = [];

  constructor(private config: RateLimitConfig) {}

  /**
   * Check if a request is allowed
   */
  checkLimit(): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Remove requests outside the current window
    this.requests = this.requests.filter(timestamp => timestamp > windowStart);

    if (this.requests.length < this.config.maxRequests) {
      this.requests.push(now);
      return {
        allowed: true,
        remaining: this.config.maxRequests - this.requests.length,
        resetTime: this.getNextResetTime(),
      };
    } else {
      const oldestRequest = Math.min(...this.requests);
      const retryAfter = oldestRequest + this.config.windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        resetTime: this.getNextResetTime(),
        retryAfter: Math.max(0, retryAfter),
      };
    }
  }

  /**
   * Get current status
   */
  getStatus(): { requestCount: number; remaining: number; resetTime: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Clean up old requests
    this.requests = this.requests.filter(timestamp => timestamp > windowStart);

    return {
      requestCount: this.requests.length,
      remaining: this.config.maxRequests - this.requests.length,
      resetTime: this.getNextResetTime(),
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
  }

  private getNextResetTime(): number {
    if (this.requests.length === 0) {
      return Date.now() + this.config.windowMs;
    }
    const oldestRequest = Math.min(...this.requests);
    return oldestRequest + this.config.windowMs;
  }
}

/**
 * Multi-tier rate limiter for different types of operations
 */
export class MultiTierRateLimiter {
  private limiters: Map<string, TokenBucketRateLimiter | SlidingWindowRateLimiter> = new Map();

  constructor(private configs: Record<string, RateLimitConfig & { type?: 'token-bucket' | 'sliding-window' }>) {
    for (const [tier, config] of Object.entries(configs)) {
      const limiterType = config.type || 'token-bucket';
      if (limiterType === 'sliding-window') {
        this.limiters.set(tier, new SlidingWindowRateLimiter(config));
      } else {
        this.limiters.set(tier, new TokenBucketRateLimiter(config));
      }
    }
  }

  /**
   * Check if a request is allowed for a specific tier
   */
  checkLimit(tier: string): RateLimitResult {
    const limiter = this.limiters.get(tier);
    if (!limiter) {
      throw new Error(`Unknown rate limit tier: ${tier}`);
    }
    return limiter.checkLimit();
  }

  /**
   * Get status for all tiers
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    for (const [tier, limiter] of this.limiters.entries()) {
      if (limiter instanceof TokenBucketRateLimiter) {
        status[tier] = limiter.getStatus();
      } else if (limiter instanceof SlidingWindowRateLimiter) {
        status[tier] = limiter.getStatus();
      }
    }
    return status;
  }

  /**
   * Reset all rate limiters
   */
  reset(tier?: string): void {
    if (tier) {
      const limiter = this.limiters.get(tier);
      if (limiter) {
        limiter.reset();
      }
    } else {
      for (const limiter of this.limiters.values()) {
        limiter.reset();
      }
    }
  }
}

/**
 * Rate limit error class
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfter: number,
    public readonly resetTime: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Rate limiting middleware decorator
 */
export function withRateLimit(tier: string = 'default') {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const method = descriptor.value;
    if (!method) return;

    descriptor.value = async function(this: any, ...args: any[]) {
      // Get rate limiter from context (would be injected)
      const rateLimiter = (this as any).rateLimiter as MultiTierRateLimiter;
      
      if (rateLimiter) {
        const result = rateLimiter.checkLimit(tier);
        if (!result.allowed) {
          throw new RateLimitError(
            `Rate limit exceeded for tier '${tier}'. Try again in ${result.retryAfter}ms.`,
            result.retryAfter || 0,
            result.resetTime
          );
        }
      }

      return method.apply(this, args);
    } as T;
  };
}

/**
 * Create default rate limiter configuration based on Bitbucket API limits
 */
export function createDefaultRateLimitConfig(): Record<string, RateLimitConfig & { type?: 'token-bucket' | 'sliding-window' }> {
  return {
    // Default tier for most operations
    default: {
      maxRequests: 1000,
      windowMs: 3600000, // 1 hour
      type: 'token-bucket',
    },
    
    // Higher limits for read-only operations
    read: {
      maxRequests: 1500,
      windowMs: 3600000, // 1 hour
      type: 'token-bucket',
    },
    
    // Lower limits for write operations
    write: {
      maxRequests: 500,
      windowMs: 3600000, // 1 hour
      type: 'sliding-window',
    },
    
    // Very low limits for expensive operations
    expensive: {
      maxRequests: 100,
      windowMs: 3600000, // 1 hour
      type: 'sliding-window',
    },
    
    // Per-minute limits for burst protection
    burst: {
      maxRequests: 60,
      windowMs: 60000, // 1 minute
      type: 'sliding-window',
    },
  };
}
