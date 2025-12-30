/**
 * Database for Vercel Postgres
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
 * Vercel Postgres adapter (using @vercel/postgres for Edge Runtime support)
 */
export class VercelPostgres implements Database {
  private sql: any;
  private connectionString?: string;
  private usingVercelPostgres = true;
  private pgClient: any = null;

  constructor(connectionString?: string) {
    // Store connection string if provided
    if (connectionString) {
      this.connectionString = connectionString;
    }
  }

  private async getSql() {
    if (!this.sql) {
      try {
        // Check if using Prisma data proxy or other non-Vercel Postgres
        const isPrismaProxy = this.connectionString?.includes('prisma.io');
        const isNeonDirect = this.connectionString?.includes('.pooler.neon.tech');
        const isVercelPooler = this.connectionString?.includes('pooler.vercel-storage.com');

        if (isPrismaProxy || isNeonDirect) {
          // Use pg package for Prisma/Neon direct connections
          this.usingVercelPostgres = false;
          const pg = await import('pg');
          const { Client } = pg;
          this.pgClient = new Client({ connectionString: this.connectionString });
          await this.pgClient.connect();
          this.sql = this.pgClient;
        } else if (isVercelPooler) {
          // Use @vercel/postgres sql for Vercel pooler
          const postgres = await import('@vercel/postgres');
          this.sql = postgres.sql;
        } else {
          // Try Vercel Postgres first, fall back to pg
          try {
            const postgres = await import('@vercel/postgres');
            this.sql = postgres.sql;
          } catch {
            // Fall back to pg
            const pg = await import('pg');
            const { Client } = pg;
            this.pgClient = new Client({ connectionString: this.connectionString });
            await this.pgClient.connect();
            this.sql = this.pgClient;
            this.usingVercelPostgres = false;
          }
        }
      } catch (err) {
        const errMsg = err && typeof err === 'object' && 'message' in err
          ? (err as Error).message
          : String(err);
        throw new Error(`Failed to initialize database: ${errMsg}`);
      }
    }
    return this.sql;
  }

  prepare(query: string): Statement {
    return new PostgresStatement(query, this);
  }

  async batch<T>(statements: Statement[]): Promise<{ results: T[]; success: boolean }[]> {
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

  async query(sqlQuery: string, params: (string | number | boolean | null)[]) {
    const sql = await this.getSql();

    // Convert ? placeholders to $1, $2, etc.
    let index = 1;
    const convertedQuery = sqlQuery.replace(/\?/g, () => `$${index++}`);

    return sql.query(convertedQuery, params);
  }
}

export class PostgresStatement implements Statement {
  private params: (string | number | boolean | null)[] = [];

  constructor(private query: string, private db: VercelPostgres) {}

  bind(...values: (string | number | boolean | null)[]): Statement {
    this.params = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    // Handle LIMIT 1 for single row
    const limitedQuery = this.query.toLowerCase().includes('limit')
      ? this.query
      : `${this.query} LIMIT 1`;

    const result = await this.db.query(limitedQuery, this.params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const result = await this.db.query(this.query, this.params);
    return { results: result.rows };
  }

  async run(): Promise<{ success: boolean; meta: { last_row_id?: number; changes?: number } }> {
    // For INSERT, return the last row id
    if (this.query.trim().toUpperCase().startsWith('INSERT')) {
      const result = await this.db.query(`${this.query} RETURNING id`, this.params);
      return {
        success: true,
        meta: {
          last_row_id: result.rows[0]?.id as number,
          changes: result.rowCount ?? 1,
        },
      };
    }

    // For UPDATE/DELETE
    const result = await this.db.query(this.query, this.params);
    return {
      success: true,
      meta: {
        changes: result.rowCount ?? 0,
      },
    };
  }
}

/**
 * Get environment value from process.env (Vercel)
 */
function getEnvValue(locals: App.Locals, key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }

  return undefined;
}

/**
 * Create Vercel Postgres database
 */
export function createDatabase(locals: App.Locals): Database {
  const postgresUrl = getEnvValue(locals, 'POSTGRES_URL');
  const databaseUrl = getEnvValue(locals, 'DATABASE_URL');

  if (postgresUrl || databaseUrl) {
    return new VercelPostgres(postgresUrl || databaseUrl);
  }

  throw new Error('No database configured. Please configure Vercel Postgres (POSTGRES_URL or DATABASE_URL).');
}

export function createDatabaseOrNull(locals: App.Locals): Database | null {
  try {
    return createDatabase(locals);
  } catch {
    return null;
  }
}
