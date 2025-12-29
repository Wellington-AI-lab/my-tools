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

// D1 Database types (simplified for edge runtime)
type D1PreparedStatement = {
  bind(...params: unknown[]): D1PreparedStatement;
  raw(): Promise<D1Result<unknown>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result<unknown>>;
};

type D1Result<T> = {
  results?: T[];
  meta?: { changes?: number; duration?: number; last_row_id?: number };
};

type D1Database = {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]>;
  exec(sql: string): Promise<D1Result<unknown>>;
};

type CloudflareEnv = {
  // Auth
  SESSION_SECRET?: string;
  SITE_PASSWORD_HASH?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_KEY?: string;

  // Data providers
  FINNHUB_API_KEY?: string;
  FMP_API_KEY?: string;
  POLYGON_API_KEY?: string;

  // RedNote DeepAgent - OpenAI compatible LLM
  LLM_BASE_URL?: string; // e.g. "https://api.openai.com"
  LLM_API_KEY?: string;
  LLM_MODEL?: string; // e.g. "gpt-4o-mini" / "deepseek-chat" / "claude-3-5-sonnet"

  // RedNote DeepAgent - Apify (optional)
  APIFY_TOKEN?: string;

  // Cloudflare AI
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;

  // Third-party AI
  ANTHROPIC_API_KEY?: string;
  GLM_API_KEY?: string;

  // Intelligence
  RSSHUB_BASE_URL?: string;

  // Environment
  NODE_ENV?: string;
  API_BASE_URL?: string;

  // Storage
  KV?: KVNamespace;
  TRENDS_DB?: D1Database;
  INTELLIGENCE_DB?: D1Database;
};

declare namespace App {
  interface Locals {
    runtime?: { env: CloudflareEnv };
    user?: { role: 'user' | 'admin' };
  }
}

declare module '*?raw' {
  const content: string;
  export default content;
}
