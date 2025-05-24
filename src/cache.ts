/**
 * Caching system for the Bitbucket MCP server
 */

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  key: string;
}

export interface CacheOptions {
  maxSize: number;
  defaultTtl: number; // Default TTL in milliseconds
  cleanupInterval: number; // Cleanup interval in milliseconds
}

export interface CacheStats {
  hits: number;
  misses: number;
  totalRequests: number;
  hitRate: number;
  cacheSize: number;
  maxSize: number;
}

/**
 * LRU Cache implementation with TTL support
 */
export class LRUCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder = new Map<string, number>(); // Track access order for LRU
  private accessCounter = 0;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
    hitRate: 0,
    cacheSize: 0,
    maxSize: 0,
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private options: CacheOptions) {
    this.stats.maxSize = options.maxSize;
    
    // Start cleanup timer
    if (options.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, options.cleanupInterval);
    }
  }

  /**
   * Get an item from the cache
   */
  get(key: string): T | null {
    this.stats.totalRequests++;
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      this.updateCacheSize();
      return null;
    }

    // Update access order
    this.accessOrder.set(key, ++this.accessCounter);
    this.stats.hits++;
    this.updateHitRate();
    
    return entry.data;
  }

  /**
   * Set an item in the cache
   */
  set(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.options.defaultTtl,
      key,
    };

    // If cache is at capacity, remove LRU item
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
    this.updateCacheSize();
  }

  /**
   * Delete an item from the cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.accessOrder.delete(key);
      this.updateCacheSize();
    }
    return deleted;
  }

  /**
   * Check if a key exists in the cache (without affecting access order)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if entry has expired
    const now = Date.now();
    if (now > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.updateCacheSize();
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
    this.updateCacheSize();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      hitRate: 0,
      cacheSize: this.cache.size,
      maxSize: this.options.maxSize,
    };
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache configuration
   */
  getConfig(): CacheOptions {
    return { ...this.options };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newOptions: Partial<CacheOptions>): void {
    this.options = { ...this.options, ...newOptions };
    this.stats.maxSize = this.options.maxSize;

    // If max size was reduced, evict entries if necessary
    while (this.cache.size > this.options.maxSize) {
      this.evictLRU();
    }

    // Restart cleanup timer if interval changed
    if (newOptions.cleanupInterval !== undefined && this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      if (this.options.cleanupInterval > 0) {
        this.cleanupTimer = setInterval(() => {
          this.cleanup();
        }, this.options.cleanupInterval);
      }
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.updateCacheSize();
    }
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): void {
    if (this.accessOrder.size === 0) return;

    let lruKey: string | null = null;
    let lruAccess = Number.MAX_SAFE_INTEGER;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < lruAccess) {
        lruAccess = accessTime;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
    }
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? this.stats.hits / this.stats.totalRequests 
      : 0;
  }

  /**
   * Update cache size in stats
   */
  private updateCacheSize(): void {
    this.stats.cacheSize = this.cache.size;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
  }
}

/**
 * Cache key generator for API requests
 */
export class CacheKeyGenerator {
  static forRepository(workspace: string, repoSlug: string): string {
    return `repo:${workspace}:${repoSlug}`;
  }

  static forRepositories(workspace: string, options: Record<string, any> = {}): string {
    const params = Object.keys(options)
      .sort()
      .map(key => `${key}=${options[key]}`)
      .join('&');
    return `repos:${workspace}${params ? `:${params}` : ''}`;
  }

  static forPullRequests(workspace: string, repoSlug: string, state?: string): string {
    return `prs:${workspace}:${repoSlug}${state ? `:${state}` : ''}`;
  }

  static forIssues(workspace: string, repoSlug: string, state?: string): string {
    return `issues:${workspace}:${repoSlug}${state ? `:${state}` : ''}`;
  }

  static forBranches(workspace: string, repoSlug: string): string {
    return `branches:${workspace}:${repoSlug}`;
  }

  static forCommits(workspace: string, repoSlug: string, branch?: string): string {
    return `commits:${workspace}:${repoSlug}${branch ? `:${branch}` : ''}`;
  }

  static forSearch(workspace: string, query: string, types: string[], limit: number): string {
    const typesStr = types.sort().join(',');
    return `search:${workspace}:${encodeURIComponent(query)}:${typesStr}:${limit}`;
  }
}

/**
 * Cache decorator for API methods
 */
export function cached<T extends (...args: any[]) => Promise<any>>(
  cache: LRUCache,
  keyGenerator: (...args: any[]) => string,
  ttl?: number
) {
  return function (
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const method = descriptor.value;
    if (!method) return;

    descriptor.value = async function (this: any, ...args: any[]) {
      const cacheKey = keyGenerator.apply(this, args);
      
      // Try to get from cache first
      const cached = cache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute original method
      const result = await method.apply(this, args);
      
      // Cache the result
      cache.set(cacheKey, result, ttl);
      
      return result;
    } as T;
  };
}

/**
 * Cache management utilities
 */
export class CacheManager {
  private caches = new Map<string, LRUCache>();

  /**
   * Create a new cache instance
   */
  createCache(name: string, options: CacheOptions): LRUCache {
    const cache = new LRUCache(options);
    this.caches.set(name, cache);
    return cache;
  }

  /**
   * Get a cache instance by name
   */
  getCache(name: string): LRUCache | undefined {
    return this.caches.get(name);
  }

  /**
   * Remove a cache instance
   */
  removeCache(name: string): boolean {
    const cache = this.caches.get(name);
    if (cache) {
      cache.destroy();
      return this.caches.delete(name);
    }
    return false;
  }

  /**
   * Get statistics for all caches
   */
  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }
    return stats;
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * Reset statistics for all caches
   */
  resetAllStats(): void {
    for (const cache of this.caches.values()) {
      cache.resetStats();
    }
  }

  /**
   * Destroy all caches
   */
  destroyAll(): void {
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();
  }
}

// Global cache manager instance
export const cacheManager = new CacheManager();

// Default cache instance for API responses
export const apiCache = cacheManager.createCache('api', {
  maxSize: 100,
  defaultTtl: 5 * 60 * 1000, // 5 minutes
  cleanupInterval: 60 * 1000, // 1 minute
});
