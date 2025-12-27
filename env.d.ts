/// <reference types="astro/client" />

type KVNamespace = {
  get(key: string, options?: { type?: 'text' | 'json' }): Promise<string | unknown | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: Record<string, unknown> }
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

type CloudflareEnv = {
  // Auth
  SESSION_SECRET?: string;
  SITE_PASSWORD_HASH?: string;
  ADMIN_PASSWORD_HASH?: string;

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

  // Storage
  KV?: KVNamespace;
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


