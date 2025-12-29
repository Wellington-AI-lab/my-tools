export function getEnv(locals: App.Locals) {
  // Cloudflare Pages runtime (adapter) injects bindings into locals.runtime.env.
  const env = locals.runtime?.env;
  if (!env) {
    throw new Error('Cloudflare runtime not available. Use `wrangler pages dev` for local development.');
  }
  return env;
}

export function getKV(locals: App.Locals): KVNamespace | null {
  const env = getEnv(locals) as { KV?: KVNamespace };
  return env?.KV ?? null;
}

/**
 * 获取 Intelligence D1 数据库（新闻聚合数据源）
 */
export function getIntelligenceDB(locals: App.Locals): D1Database | null {
  const env = getEnv(locals) as { INTELLIGENCE_DB?: D1Database };
  return env?.INTELLIGENCE_DB ?? null;
}

/**
 * 获取 Intelligence D1，如果未绑定则抛出错误
 */
export function requireIntelligenceDB(locals: App.Locals): D1Database {
  const db = getIntelligenceDB(locals);

  if (!db) {
    throw new Error('Intelligence D1 binding is missing. Please bind D1 as `INTELLIGENCE_DB` in Cloudflare Pages (Settings → Functions → D1 database bindings).');
  }

  return db;
}

/**
 * 统一的生产环境判断
 */
export function isProduction(locals: App.Locals): boolean {
  const env = getEnv(locals);
  return env?.NODE_ENV === 'production';
}

/**
 * 获取 KV，如果 KV 未绑定则抛出错误
 */
export function requireKV(locals: App.Locals): KVNamespace {
  const kv = getKV(locals);

  if (!kv) {
    throw new Error('KV binding is missing. Please bind KV as `KV` in Cloudflare Pages (Settings → Functions → KV namespace bindings).');
  }

  return kv;
}


