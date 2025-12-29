/**
 * KV Storage for Vercel
 */

export interface KVStorage {
  get(key: string, options?: { type: 'text' | 'json' | 'arrayBuffer' }): Promise<string | null | object>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Vercel KV adapter (supports both @vercel/kv and direct Redis URL)
 */
export class VercelKV implements KVStorage {
  private kv: any;
  private clientType: 'vercel' | 'ioredis';
  private initialized = false;

  constructor() {
    // Defer initialization to async init()
  }

  private async init() {
    if (this.initialized) return;

    // Try Vercel KV first
    if (process.env.KV_URL && process.env.KV_REST_API_READ_WRITE_TOKEN) {
      const { createClient } = await import('@vercel/kv');
      this.kv = createClient({
        url: process.env.KV_URL,
        token: process.env.KV_REST_API_READ_WRITE_TOKEN,
      });
      this.clientType = 'vercel';
    }
    // Fallback to Redis URL (Redis Labs, Upstash, etc.)
    else if (process.env.REDIS_URL) {
      const { default: Redis } = await import('ioredis');
      this.kv = new Redis(process.env.REDIS_URL);
      this.clientType = 'ioredis';
    }
    else {
      throw new Error('No KV configuration found. Need KV_URL/KV_REST_API_READ_WRITE_TOKEN or REDIS_URL');
    }

    this.initialized = true;
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  async get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' }): Promise<string | null | object> {
    await this.ensureInitialized();
    const value = await this.kv.get(key);

    if (value === null) return null;
    if (options?.type === 'json') {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    }
    return value as string | null;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    await this.ensureInitialized();
    if (options?.expirationTtl) {
      await this.kv.setex(key, options.expirationTtl, value);
    } else {
      await this.kv.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureInitialized();
    await this.kv.del(key);
  }
}

/**
 * Create KV storage for Vercel
 * Supports both Vercel KV environment variables and test mocks (locals.runtime.env.KV)
 */
export function createKVStorage(locals: App.Locals): KVStorage {
  // Check for test mock KV in locals.runtime.env.KV first (for testing)
  const runtimeKV = locals.runtime?.env?.KV as KVStorage | undefined;
  if (runtimeKV && typeof runtimeKV.get === 'function') {
    return runtimeKV;
  }

  // Vercel environment (check for env vars)
  if (process.env.KV_URL && process.env.KV_REST_API_READ_WRITE_TOKEN) {
    return new VercelKV();
  }

  // Redis URL (Redis Labs, Upstash, etc.)
  if (process.env.REDIS_URL) {
    return new VercelKV();
  }

  throw new Error('No KV storage configured. Please configure Vercel KV (KV_URL/KV_REST_API_READ_WRITE_TOKEN) or Redis URL (REDIS_URL).');
}

export function createKVStorageOrNull(locals: App.Locals): KVStorage | null {
  try {
    return createKVStorage(locals);
  } catch {
    return null;
  }
}
