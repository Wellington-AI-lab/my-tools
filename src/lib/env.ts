import { createKVStorage, createKVStorageOrNull, type KVStorage } from './storage/kv';
import { createDatabase, createDatabaseOrNull, type Database } from './storage/db';

/**
 * 获取环境变量（Vercel）
 */
export function getEnv(locals: App.Locals): Record<string, unknown> {
  // Vercel environment - access known environment variables
  // In Edge Runtime, process.env is not fully enumerable
  const vercelEnv: Record<string, unknown> = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    SITE_PASSWORD_HASH: process.env.SITE_PASSWORD_HASH,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    NODE_ENV: process.env.NODE_ENV,
    POSTGRES_URL: process.env.POSTGRES_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    KV_URL: process.env.KV_URL,
    KV_REST_API_READ_WRITE_TOKEN: process.env.KV_REST_API_READ_WRITE_TOKEN,
    GLM_API_KEY: process.env.GLM_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    RSSHUB_BASE_URL: process.env.RSSHUB_BASE_URL,
    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
    FMP_API_KEY: process.env.FMP_API_KEY,
    POLYGON_API_KEY: process.env.POLYGON_API_KEY,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_MODEL: process.env.LLM_MODEL,
    APIFY_TOKEN: process.env.APIFY_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    // Signal Push Module
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    LARK_WEBHOOK_URL: process.env.LARK_WEBHOOK_URL,
  };

  return vercelEnv;
}

/**
 * 统一的生产环境判断
 */
export function isProduction(locals: App.Locals): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * 获取 KV 存储（Vercel KV）
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
    throw new Error('KV storage not configured. Please configure Vercel KV (KV_URL/KV_REST_API_READ_WRITE_TOKEN or REDIS_URL).');
  }
  return kv;
}

/**
 * 获取数据库（Vercel Postgres）
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
    throw new Error('Database not configured. Please configure Vercel Postgres (POSTGRES_URL or DATABASE_URL).');
  }
  return db;
}

