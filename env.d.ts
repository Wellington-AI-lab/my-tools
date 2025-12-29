/// <reference types="astro/client" />

type KVNamespace = {
  get(key: string, options?: { type?: 'text' | 'json' }): Promise<string | unknown | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; expiration?: number; metadata?: Record<string, unknown> }
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

// Postgres Database types (simplified for edge runtime)
type PreparedStatement = {
  bind(...params: unknown[]): PreparedStatement;
  raw(): Promise<QueryResult<unknown>>;
  all<T = unknown>(): Promise<QueryResult<T>>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<QueryResult<unknown>>;
};

type QueryResult<T> = {
  results?: T[];
  meta?: { changes?: number; duration?: number; last_row_id?: number };
};

type Database = {
  prepare(sql: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<QueryResult<unknown>[]>;
  exec(sql: string): Promise<QueryResult<unknown>>;
};

type VercelEnv = {
  // Auth
  SESSION_SECRET?: string;
  SITE_PASSWORD_HASH?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_KEY?: string;

  // Data providers
  FINNHUB_API_KEY?: string;
  FMP_API_KEY?: string;
  POLYGON_API_KEY?: string;

  // LLM
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;

  // Apify (optional)
  APIFY_TOKEN?: string;

  // Third-party AI
  ANTHROPIC_API_KEY?: string;
  GLM_API_KEY?: string;

  // Intelligence
  RSSHUB_BASE_URL?: string;

  // Environment
  NODE_ENV?: string;
  API_BASE_URL?: string;

  // Cron
  CRON_SECRET?: string;

  // Storage
  KV_URL?: string;
  KV_REST_API_READ_WRITE_TOKEN?: string;
  POSTGRES_URL?: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
};

declare namespace App {
  interface Locals {
    runtime?: { env: VercelEnv };
    user?: { role: 'user' | 'admin' };
  }
}

declare module '*?raw' {
  const content: string;
  export default content;
}
