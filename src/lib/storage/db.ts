/**
 * Database Abstraction Layer
 *
 * Supports both Cloudflare D1 and Vercel Postgres
 */

export interface Database {
  prepare(query: string): Statement;
  batch<T>(statements: Statement[]): Promise<{ results: T[]; success: boolean }[]>;
}

export interface Statement {
  bind(...values: (string | number | boolean | null)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { last_row_id?: number; changes?: number } }>;
}

/**
 * Cloudflare D1 adapter
 */
export class D1Database implements Database {
  constructor(private db: import('@cloudflare/workers-types').D1Database) {}

  prepare(query: string): Statement {
    const stmt = this.db.prepare(query);
    return new D1Statement(stmt);
  }

  batch<T>(statements: Statement[]): Promise<{ results: T[]; success: boolean }[]> {
    const d1Statements = statements.map(s => (s as D1Statement).statement);
    return this.db.batch(d1Statements);
  }
}

class D1Statement implements Statement {
  private boundValues: (string | number | boolean | null)[] = [];

  constructor(public statement: import('@cloudflare/workers-types').D1PreparedStatement) {}

  bind(...values: (string | number | boolean | null)[]): Statement {
    this.boundValues = values;
    this.statement = this.statement.bind(...values);
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.statement.first<T>();
  }

  async all<T>(): Promise<{ results: T[] }> {
    return this.statement.all<T>();
  }

  async run(): Promise<{ success: boolean; meta: { last_row_id?: number; changes?: number } }> {
    const result = await this.statement.run();
    return {
      success: result.success,
      meta: {
        last_row_id: result.meta.last_row_id,
        changes: result.meta.changes,
      },
    };
  }
}

/**
 * Vercel Postgres adapter (works with Prisma Postgres via pg package)
 */
export class VercelPostgres implements Database {
  private client: any;
  private connected = false;
  private clientPromise: Promise<any> | null = null;

  constructor() {
    // Defer initialization to async init()
  }

  private async init() {
    if (this.connected) return;

    if (!this.clientPromise) {
      // Use pg for Prisma Postgres compatibility
      this.clientPromise = (async () => {
        const pg = await import('pg');
        const { Client } = pg;

        const client = new Client({
          connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        });

        await client.connect();
        this.connected = true;
        return client;
      })();
    }

    this.client = await this.clientPromise;
  }

  private async ensureConnected() {
    await this.init();
  }

  prepare(query: string): Statement {
    return new PostgresStatement(query, this);
  }

  async batch<T>(statements: Statement[]): Promise<{ results: T[]; success: boolean }[]> {
    await this.ensureConnected();
    const results: { results: T[]; success: boolean }[] = [];
    for (const stmt of statements) {
      try {
        const result = await stmt.all<T>();
        results.push({ ...result, success: true });
      } catch (e) {
        results.push({ results: [], success: false });
      }
    }
    return results;
  }

  async query(sql: string, params: (string | number | boolean | null)[]) {
    await this.ensureConnected();
    return this.client.query(sql, params);
  }
}

class PostgresStatement implements Statement {
  private params: (string | number | boolean | null)[] = [];
  private paramIndex = 1;
  private convertedQuery: string;

  constructor(private query: string, private db: VercelPostgres) {
    // Convert ? placeholders to $1, $2, etc. for Postgres
    this.convertedQuery = this.convertPlaceholders(query);
  }

  private convertPlaceholders(query: string): string {
    let index = 1;
    return query.replace(/\?/g, () => `$${index++}`);
  }

  bind(...values: (string | number | boolean | null)[]): Statement {
    this.params = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    // Handle LIMIT 1 for single row
    const limitedQuery = this.convertedQuery.toLowerCase().includes('limit')
      ? this.convertedQuery
      : `${this.convertedQuery} LIMIT 1`;

    const result = await this.db.query(limitedQuery, this.params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const result = await this.db.query(this.convertedQuery, this.params);
    return { results: result.rows };
  }

  async run(): Promise<{ success: boolean; meta: { last_row_id?: number; changes?: number } }> {
    // For INSERT, return the last row id
    if (this.convertedQuery.trim().toUpperCase().startsWith('INSERT')) {
      const result = await this.db.query(`${this.convertedQuery} RETURNING id`, this.params);
      return {
        success: true,
        meta: {
          last_row_id: result.rows[0]?.id as number,
          changes: result.rowCount ?? 1,
        },
      };
    }

    // For UPDATE/DELETE
    const result = await this.db.query(this.convertedQuery, this.params);
    return {
      success: true,
      meta: {
        changes: result.rowCount ?? 0,
      },
    };
  }
}

/**
 * Detect and create appropriate database
 */
export function createDatabase(locals: App.Locals): Database {
  const env = locals.runtime?.env;

  // Cloudflare D1 environment
  if (env?.INTELLIGENCE_DB) {
    return new D1Database(env.INTELLIGENCE_DB as import('@cloudflare/workers-types').D1Database);
  }

  // Vercel Postgres environment (check for env vars)
  if (process.env.POSTGRES_URL || process.env.DATABASE_URL) {
    return new VercelPostgres();
  }

  throw new Error('No database configured. Please configure Cloudflare D1 or Vercel Postgres.');
}

export function createDatabaseOrNull(locals: App.Locals): Database | null {
  try {
    return createDatabase(locals);
  } catch {
    return null;
  }
}
