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

export function getD1(locals: App.Locals): D1Database | null {
  const env = getEnv(locals) as { TRENDS_DB?: D1Database };
  return env?.TRENDS_DB ?? null;
}

export function requireD1(locals: App.Locals): D1Database {
  const d1 = getD1(locals);

  if (!d1) {
    throw new Error('D1 binding is missing. Please bind D1 as `TRENDS_DB` in Cloudflare Pages (Settings → Functions → D1 database bindings).');
  }

  return d1;
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


