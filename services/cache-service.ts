import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cache Service
 * Provides stale-while-revalidate caching for faster app loading
 */

export const CACHE_KEYS = {
    GROUPS_LIST: 'cache:groups',
    FRIEND_DETAIL: (id: string) => `cache:friend:${id}`,
    FRIEND_EXPENSES: (friendId: string) => `cache:friend_expenses:${friendId}`,
    GROUP_DETAIL: (id: string) => `cache:group:${id}`,
    GROUP_EXPENSES: (groupId: string) => `cache:group_expenses:${groupId}`,
    USER_BALANCES: 'cache:user_balances',
};

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl?: number; // Time to live in milliseconds
}

export const cacheService = {
    /**
     * Get cached data
     * Returns null if cache is empty or expired
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            const raw = await AsyncStorage.getItem(key);
            if (!raw) return null;

            const entry: CacheEntry<T> = JSON.parse(raw);

            // Check if expired
            if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
                await this.invalidate(key);
                return null;
            }

            return entry.data;
        } catch (error) {
            console.warn('[Cache] Error reading cache:', key, error);
            return null;
        }
    },

    /**
     * Set cached data
     * @param key Cache key
     * @param data Data to cache
     * @param ttlMs Optional TTL in milliseconds (default: 24 hours)
     */
    async set<T>(key: string, data: T, ttlMs: number = 24 * 60 * 60 * 1000): Promise<void> {
        try {
            const entry: CacheEntry<T> = {
                data,
                timestamp: Date.now(),
                ttl: ttlMs,
            };
            await AsyncStorage.setItem(key, JSON.stringify(entry));
        } catch (error) {
            console.warn('[Cache] Error writing cache:', key, error);
        }
    },

    /**
     * Invalidate (delete) a specific cache key
     */
    async invalidate(key: string): Promise<void> {
        try {
            await AsyncStorage.removeItem(key);
        } catch (error) {
            console.warn('[Cache] Error invalidating cache:', key, error);
        }
    },

    /**
     * Invalidate all cache keys matching a pattern (prefix)
     */
    async invalidatePattern(prefix: string): Promise<void> {
        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const matchingKeys = allKeys.filter(k => k.startsWith(prefix));
            if (matchingKeys.length > 0) {
                await AsyncStorage.multiRemove(matchingKeys);
            }
        } catch (error) {
            console.warn('[Cache] Error invalidating pattern:', prefix, error);
        }
    },

    /**
     * Clear all cache (for debugging or logout)
     */
    async clearAll(): Promise<void> {
        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const cacheKeys = allKeys.filter(k => k.startsWith('cache:'));
            if (cacheKeys.length > 0) {
                await AsyncStorage.multiRemove(cacheKeys);
            }
        } catch (error) {
            console.warn('[Cache] Error clearing cache:', error);
        }
    },

    /**
     * Helper to get cache age in seconds (for debugging)
     */
    async getAge(key: string): Promise<number | null> {
        try {
            const raw = await AsyncStorage.getItem(key);
            if (!raw) return null;

            const entry: CacheEntry<unknown> = JSON.parse(raw);
            return Math.floor((Date.now() - entry.timestamp) / 1000);
        } catch {
            return null;
        }
    },
};
