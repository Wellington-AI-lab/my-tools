export function getEnv(locals: App.Locals) {
  // Cloudflare Pages runtime (adapter) injects bindings into locals.runtime.env.
  // In local dev, fall back to process.env.
  return (locals.runtime?.env ?? (process.env as unknown)) as any;
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

  if (!d1 && isProduction(locals)) {
    throw new Error('D1 binding is missing. Please bind D1 as `TRENDS_DB` in Cloudflare Pages (Settings → Functions → D1 database bindings).');
  }

  if (!d1) {
    // Dev fallback: create a minimal in-memory D1 for local dev
    const mem = (globalThis as any).__DEV_D1__ as Map<string, any[]> | undefined;
    const store = mem ?? new Map<string, any[]>();
    (globalThis as any).__DEV_D1__ = store;

    return {
      async prepare(stmt: string) {
        const mockBatch = async (params: any[][]) => {
          // Simple mock - just return empty results
          return { results: [] };
        };
        return {
          bind(...params: any[]) {
            return {
              async all() {
                return { results: [] };
              },
              async first() {
                return null;
              },
              async run() {
                return { success: true, meta: { duration: 0 } };
              },
              async batch(...bindings: any[]) {
                return mockBatch(bindings);
              }
            };
          },
          async all(params?: any) {
            return { results: [] };
          },
          async first(params?: any) {
            return null;
          },
          async run(params?: any) {
            return { success: true, meta: { duration: 0 } };
          }
        } as any;
      },
      batch(statements: D1Statement[]) {
        return Promise.all(statements.map(s => s.all()));
      },
      exec(stmt: string) {
        return Promise.resolve({ success: true, meta: { duration: 0 } } as any);
      }
    } as unknown as D1Database;
  }

  return d1;
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


