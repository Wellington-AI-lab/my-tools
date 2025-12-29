import { createKVStorage, createKVStorageOrNull, type KVStorage } from './storage/kv';
import { createDatabase, createDatabaseOrNull, type Database } from './storage/db';

/**
 * 获取环境变量（兼容 Cloudflare 和 Vercel）
 */
export function getEnv(locals: App.Locals): Record<string, unknown> {
  // Cloudflare Pages runtime (adapter) injects bindings into locals.runtime.env.
  const cloudflareEnv = locals.runtime?.env;
  if (cloudflareEnv) {
    return cloudflareEnv;
  }

  // Vercel environment - directly access known environment variables
  // In Edge Runtime, process.env is not fully enumerable
  const vercelEnv: Record<string, unknown> = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    SITE_PASSWORD_HASH: process.env.SITE_PASSWORD_HASH,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    NODE_ENV: process.env.NODE_ENV,
    POSTGRES_URL: process.env.POSTGRES_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    GLM_API_KEY: process.env.GLM_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    RSSHUB_BASE_URL: process.env.RSSHUB_BASE_URL,
  };

  return vercelEnv;
}

/**
 * 统一的生产环境判断
 */
export function isProduction(locals: App.Locals): boolean {
  const env = locals.runtime?.env;
  return env?.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
}

/**
 * 获取 KV 存储（兼容 Cloudflare 和 Vercel）
 */
export function getKV(locals: App.Locals): KVStorage | null {
  return createKVStorageOrNull(locals);
}

/**
 * 获取 KV，如果 KV 未配置则抛出错误
 */
export function requireKV(locals: App.Locals): KVStorage {
  const kv = getKV(locals);
  if (!kv) {
    throw new Error('KV storage not configured. Please configure Cloudflare KV or Vercel KV.');
  }
  return kv;
}

/**
 * 获取数据库（兼容 Cloudflare D1 和 Vercel Postgres）
 */
export function getIntelligenceDB(locals: App.Locals): Database | null {
  return createDatabaseOrNull(locals);
}

/**
 * 获取数据库，如果未配置则抛出错误
 */
export function requireIntelligenceDB(locals: App.Locals): Database {
  const db = getIntelligenceDB(locals);
  if (!db) {
    throw new Error('Database not configured. Please configure Cloudflare D1 or Vercel Postgres.');
  }
  return db;
}

/**
 * Legacy types for backward compatibility
 */
export type KVNamespace = KVStorage;
export type D1Database = Database;


