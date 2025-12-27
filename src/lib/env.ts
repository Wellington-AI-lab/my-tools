export function getEnv(locals: App.Locals) {
  // Cloudflare Pages runtime (adapter) injects bindings into locals.runtime.env.
  // In local dev, fall back to process.env.
  return (locals.runtime?.env ?? (process.env as unknown)) as any;
}

export function getKV(locals: App.Locals): KVNamespace | null {
  const env = getEnv(locals) as { KV?: KVNamespace };
  return env?.KV ?? null;
}

/**
 * 统一的生产环境判断
 */
export function isProduction(locals: App.Locals): boolean {
  const env = getEnv(locals);
  return env?.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
}

/**
 * 获取 KV，如果在生产环境且 KV 未绑定则抛出错误
 * 在开发环境提供内存 fallback
 */
export function requireKV(locals: App.Locals): KVNamespace {
  const kv = getKV(locals);

  if (!kv && isProduction(locals)) {
    throw new Error('KV binding is missing. Please bind KV as `KV` in Cloudflare Pages (Settings → Functions → KV namespace bindings).');
  }

  // Dev fallback: create a minimal in-memory KV for local dev UX.
  if (!kv) {
    const mem = (globalThis as any).__DEV_KV__ as Map<string, string> | undefined;
    const store = mem ?? new Map<string, string>();
    (globalThis as any).__DEV_KV__ = store;
    return {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
      async delete(key: string) {
        store.delete(key);
      },
    } as unknown as KVNamespace;
  }

  return kv;
}


