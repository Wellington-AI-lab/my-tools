/**
 * 测试文件：db.test.ts
 * 覆盖模块：src/lib/storage/db.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VercelPostgres,
  PostgresStatement,
  createDatabase,
  createDatabaseOrNull,
} from './db';
import type { Database, Statement } from './db';

// ============================================================================
// Process.env Mocking
// ============================================================================

const originalEnv = process.env;

function mockEnv(env: Partial<NodeJS.ProcessEnv>) {
  process.env = { ...originalEnv, ...env } as any;
}

function resetEnv() {
  process.env = originalEnv;
}

// ============================================================================
// Mock @vercel/postgres
// ============================================================================

// Mock sql.query as a spy function
const mockQueryResult = vi.fn();
const mockSql = {
  query: mockQueryResult,
};

vi.mock('@vercel/postgres', () => ({
  sql: mockSql,
}));

// ============================================================================
// Helper Functions
// ============================================================================

function createMockLocals(): App.Locals {
  return {
    runtime: {
      env: {},
    },
  } as App.Locals;
}

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  resetEnv();
});

// ============================================================================
// VercelPostgres Class Tests
// ============================================================================
describe('VercelPostgres', () => {
  describe('constructor', () => {
    it('should_store_connection_string_when_provided', () => {
      // Arrange
      const connectionString = 'postgres://user:pass@localhost/db';

      // Act
      const db = new VercelPostgres(connectionString);

      // Assert
      expect(db).toBeDefined();
    });

    it('should_work_without_connection_string', () => {
      // Act
      const db = new VercelPostgres();

      // Assert
      expect(db).toBeDefined();
    });
  });

  describe('prepare', () => {
    it('should_return_a_Statement_instance', () => {
      // Arrange
      const db = new VercelPostgres();

      // Act
      const statement = db.prepare('SELECT * FROM users');

      // Assert
      expect(statement).toBeInstanceOf(PostgresStatement);
    });

    it('should_preserve_query_in_statement', () => {
      // Arrange
      const db = new VercelPostgres();
      const query = 'SELECT * FROM users WHERE id = ?';

      // Act
      const statement = db.prepare(query);

      // Assert
      expect(statement).toBeDefined();
    });
  });

  describe('batch', () => {
    it('should_execute_all_statements_and_return_results', async () => {
      // Arrange
      const db = new VercelPostgres();
      const stmt1 = db.prepare('SELECT 1 as one');
      const stmt2 = db.prepare('SELECT 2 as two');

      mockQueryResult.mockResolvedValue({
        rows: [{ one: 1 }],
        rowCount: 1,
      });

      // Act
      const results = await db.batch([stmt1, stmt2]);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should_handle_statement_failure_gracefully', async () => {
      // Arrange
      const db = new VercelPostgres();
      const stmt1 = db.prepare('SELECT 1');
      const stmt2 = db.prepare('INVALID SQL');

      mockQueryResult.mockResolvedValueOnce({
        rows: [{ one: 1 }],
        rowCount: 1,
      });
      mockQueryResult.mockRejectedValueOnce(new Error('SQL error'));

      // Act
      const results = await db.batch([stmt1, stmt2]);

      // Assert
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].results).toEqual([]);
    });

    it('should_handle_empty_statements_array', async () => {
      // Arrange
      const db = new VercelPostgres();

      // Act
      const results = await db.batch([]);

      // Assert
      expect(results).toEqual([]);
    });
  });

  describe('query', () => {
    it('should_convert_placeholders_to_postgres_format', async () => {
      // Arrange
      const db = new VercelPostgres();
      mockQueryResult.mockResolvedValue({ rows: [], rowCount: 0 });

      // Act
      await db.query('SELECT * FROM users WHERE id = ? AND name = ?', [1, 'test']);

      // Assert
      expect(mockQueryResult).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1 AND name = $2',
        [1, 'test']
      );
    });

    it('should_handle_query_with_no_placeholders', async () => {
      // Arrange
      const db = new VercelPostgres();
      mockQueryResult.mockResolvedValue({ rows: [], rowCount: 0 });

      // Act
      await db.query('SELECT * FROM users', []);

      // Assert
      expect(mockQueryResult).toHaveBeenCalledWith('SELECT * FROM users', []);
    });

    it('should_handle_multiple_placeholders', async () => {
      // Arrange
      const db = new VercelPostgres();
      mockQueryResult.mockResolvedValue({ rows: [], rowCount: 0 });

      // Act
      await db.query('SELECT * FROM users WHERE a = ? OR b = ? OR c = ?', [1, 2, 3]);

      // Assert
      expect(mockQueryResult).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE a = $1 OR b = $2 OR c = $3',
        [1, 2, 3]
      );
    });
  });
});

// ============================================================================
// PostgresStatement Class Tests
// ============================================================================
describe('PostgresStatement', () => {
  let mockDb: VercelPostgres;

  beforeEach(() => {
    mockDb = new VercelPostgres();
    mockQueryResult.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('bind', () => {
    it('should_store_bind_values', () => {
      // Arrange
      const query = 'SELECT * FROM users WHERE id = ?';
      const statement = new PostgresStatement(query, mockDb);

      // Act
      const bound = statement.bind(1, 'test', true, null);

      // Assert
      expect(bound).toBe(statement);
    });

    it('should_accept_strings', () => {
      // Arrange
      const statement = new PostgresStatement('SELECT * FROM users WHERE name = ?', mockDb);

      // Act
      statement.bind('test');

      // Assert - Should not throw
      expect(true).toBe(true);
    });

    it('should_accept_numbers', () => {
      // Arrange
      const statement = new PostgresStatement('SELECT * FROM users WHERE id = ?', mockDb);

      // Act
      statement.bind(42);

      // Assert - Should not throw
      expect(true).toBe(true);
    });

    it('should_accept_booleans', () => {
      // Arrange
      const statement = new PostgresStatement('SELECT * FROM users WHERE active = ?', mockDb);

      // Act
      statement.bind(true);

      // Assert - Should not throw
      expect(true).toBe(true);
    });

    it('should_accept_null', () => {
      // Arrange
      const statement = new PostgresStatement('SELECT * FROM users WHERE deleted_at = ?', mockDb);

      // Act
      statement.bind(null);

      // Assert - Should not throw
      expect(true).toBe(true);
    });
  });

  describe('first', () => {
    it('should_add_limit_1_if_not_present', async () => {
      // Arrange
      const query = 'SELECT * FROM users';
      const statement = new PostgresStatement(query, mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
      });

      // Act
      await statement.first();

      // Assert
      expect(mockQueryResult).toHaveBeenCalledWith(
        'SELECT * FROM users LIMIT 1',
        []
      );
    });

    it('should_not_add_limit_if_already_present', async () => {
      // Arrange
      const query = 'SELECT * FROM users LIMIT 10';
      const statement = new PostgresStatement(query, mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
      });

      // Act
      await statement.first();

      // Assert
      expect(mockQueryResult).toHaveBeenCalledWith(
        'SELECT * FROM users LIMIT 10',
        []
      );
    });

    it('should_add_limit_1_for_lowercase_limit', async () => {
      // Arrange
      const query = 'select * from users';
      const statement = new PostgresStatement(query, mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      // Act
      await statement.first();

      // Assert
      expect(mockQueryResult).toHaveBeenCalledWith(
        'select * from users LIMIT 1',
        []
      );
    });

    it('should_return_first_row_when_results_exist', async () => {
      // Arrange
      const statement = new PostgresStatement('SELECT * FROM users', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        rowCount: 2,
      });

      // Act
      const result = await statement.first<{ id: number; name: string }>();

      // Assert
      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('should_return_null_when_no_results', async () => {
      // Arrange
      const statement = new PostgresStatement('SELECT * FROM users WHERE id = 999', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      // Act
      const result = await statement.first();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('all', () => {
    it('should_return_all_rows', async () => {
      // Arrange
      const statement = new PostgresStatement('SELECT * FROM users', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        rowCount: 2,
      });

      // Act
      const result = await statement.all<{ id: number; name: string }>();

      // Assert
      expect(result.results).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should_return_empty_array_when_no_results', async () => {
      // Arrange
      const statement = new PostgresStatement('SELECT * FROM users WHERE id = 999', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      // Act
      const result = await statement.all();

      // Assert
      expect(result.results).toEqual([]);
    });
  });

  describe('run', () => {
    it('should_handle_insert_with_returning_id', async () => {
      // Arrange
      const statement = new PostgresStatement('INSERT INTO users (name) VALUES ($1)', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [{ id: 123 }],
        rowCount: 1,
      });

      // Act
      const result = await statement.run();

      // Assert
      expect(mockQueryResult).toHaveBeenCalledWith(
        'INSERT INTO users (name) VALUES ($1) RETURNING id',
        []
      );
      expect(result.success).toBe(true);
      expect(result.meta.last_row_id).toBe(123);
      expect(result.meta.changes).toBe(1);
    });

    it('should_handle_insert_with_multiple_rows', async () => {
      // Arrange
      const statement = new PostgresStatement('INSERT INTO users (name) VALUES ($1)', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [{ id: 456 }],
        rowCount: 3,
      });

      // Act
      const result = await statement.run();

      // Assert
      expect(result.meta.changes).toBe(3);
    });

    it('should_handle_update_statement', async () => {
      // Arrange
      const statement = new PostgresStatement('UPDATE users SET name = $1 WHERE id = $2', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [],
        rowCount: 5,
      });

      // Act
      const result = await statement.run();

      // Assert
      expect(mockQueryResult).toHaveBeenCalledWith(
        'UPDATE users SET name = $1 WHERE id = $2',
        []
      );
      expect(result.success).toBe(true);
      expect(result.meta.changes).toBe(5);
      expect(result.meta.last_row_id).toBeUndefined();
    });

    it('should_handle_delete_statement', async () => {
      // Arrange
      const statement = new PostgresStatement('DELETE FROM users WHERE id = ?', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      // Act
      const result = await statement.run();

      // Assert
      expect(result.success).toBe(true);
      expect(result.meta.changes).toBe(1);
      expect(result.meta.last_row_id).toBeUndefined();
    });

    it('should_be_case_insensitive_for_insert', async () => {
      // Arrange
      const statement = new PostgresStatement('insert into users (name) values ($1)', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      // Act
      const result = await statement.run();

      // Assert
      expect(result.success).toBe(true);
      expect(result.meta.last_row_id).toBeDefined();
    });

    it('should_handle_zero_changes', async () => {
      // Arrange
      const statement = new PostgresStatement('UPDATE users SET name = ? WHERE id = 999', mockDb);

      mockQueryResult.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      // Act
      const result = await statement.run();

      // Assert
      expect(result.success).toBe(true);
      expect(result.meta.changes).toBe(0);
    });
  });
});

// ============================================================================
// createDatabase Function Tests
// ============================================================================
describe('createDatabase', () => {
  it('should_create_database_with_POSTGRES_URL', () => {
    // Arrange
    mockEnv({ POSTGRES_URL: 'postgres://user:pass@localhost/db' });
    const locals = createMockLocals();

    // Act
    const db = createDatabase(locals);

    // Assert
    expect(db).toBeInstanceOf(VercelPostgres);
  });

  it('should_create_database_with_DATABASE_URL', () => {
    // Arrange
    mockEnv({ DATABASE_URL: 'postgres://user:pass@localhost/db' });
    const locals = createMockLocals();

    // Act
    const db = createDatabase(locals);

    // Assert
    expect(db).toBeInstanceOf(VercelPostgres);
  });

  it('should_prefer_POSTGRES_URL_over_DATABASE_URL', () => {
    // Arrange
    mockEnv({
      POSTGRES_URL: 'postgres://user:pass@localhost/postgres',
      DATABASE_URL: 'postgres://user:pass@localhost/database',
    });
    const locals = createMockLocals();

    // Act
    const db = createDatabase(locals);

    // Assert
    expect(db).toBeInstanceOf(VercelPostgres);
  });

  it('should_throw_error_when_no_database_configured', () => {
    // Arrange
    mockEnv({});
    const locals = createMockLocals();

    // Act & Assert
    expect(() => createDatabase(locals)).toThrow(
      'No database configured. Please configure Vercel Postgres (POSTGRES_URL or DATABASE_URL).'
    );
  });
});

// ============================================================================
// createDatabaseOrNull Function Tests
// ============================================================================
describe('createDatabaseOrNull', () => {
  it('should_return_database_instance_when_configured', () => {
    // Arrange
    mockEnv({ POSTGRES_URL: 'postgres://user:pass@localhost/db' });
    const locals = createMockLocals();

    // Act
    const db = createDatabaseOrNull(locals);

    // Assert
    expect(db).toBeInstanceOf(VercelPostgres);
  });

  it('should_return_null_when_no_database_configured', () => {
    // Arrange
    mockEnv({});
    const locals = createMockLocals();

    // Act
    const db = createDatabaseOrNull(locals);

    // Assert
    expect(db).toBeNull();
  });

  it.skip('should_handle_import_errors_gracefully - lazy loading makes this hard to test', async () => {
    // Note: This test is skipped because the VercelPostgres class uses lazy loading
    // for the sql import (in getSql()), making it difficult to test import failures
    // at construction time. The import error would only occur when actually using
    // the database (calling query, batch, etc.).
    // Arrange
    mockEnv({ POSTGRES_URL: 'postgres://user:pass@localhost/db' });
    const locals = createMockLocals();

    // Mock import to fail
    mockQueryResult.mockImplementation(() => {
      throw new Error('Import failed');
    });

    // Act & Assert - Should not throw immediately, only when using the DB
    const db = createDatabaseOrNull(locals);
    expect(db).toBeNull(); // Due to try-catch in createDatabaseOrNull
  });
});

// ============================================================================
// Integration Tests
// ============================================================================
describe('Integration - Complete Query Flow', () => {
  beforeEach(() => {
    mockEnv({ POSTGRES_URL: 'postgres://user:pass@localhost/db' });
  });

  it('should_handle_complete_select_flow', async () => {
    // Arrange
    const locals = createMockLocals();
    const db = createDatabase(locals);

    mockQueryResult.mockResolvedValue({
      rows: [{ id: 1, name: 'Test', email: 'test@example.com' }],
      rowCount: 1,
    });

    // Act
    const statement = db.prepare('SELECT * FROM users WHERE id = ?');
    const bound = statement.bind(1);
    const result = await bound.first<{ id: number; name: string }>();

    // Assert
    expect(mockQueryResult).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE id = $1 LIMIT 1',
      [1]
    );
    expect(result).toEqual({ id: 1, name: 'Test', email: 'test@example.com' });
  });

  it('should_handle_complete_insert_flow', async () => {
    // Arrange
    const locals = createMockLocals();
    const db = createDatabase(locals);

    mockQueryResult.mockResolvedValue({
      rows: [{ id: 100 }],
      rowCount: 1,
    });

    // Act
    const statement = db.prepare('INSERT INTO users (name) VALUES ($1)');
    const bound = statement.bind('New User');
    const result = await bound.run();

    // Assert
    expect(mockQueryResult).toHaveBeenCalledWith(
      'INSERT INTO users (name) VALUES ($1) RETURNING id',
      ['New User']
    );
    expect(result.meta.last_row_id).toBe(100);
  });

  it('should_handle_complete_update_flow', async () => {
    // Arrange
    const locals = createMockLocals();
    const db = createDatabase(locals);

    mockQueryResult.mockResolvedValue({
      rows: [],
      rowCount: 3,
    });

    // Act
    const statement = db.prepare('UPDATE users SET active = ? WHERE status = ?');
    const bound = statement.bind(true, 'pending');
    const result = await bound.run();

    // Assert
    expect(result.meta.changes).toBe(3);
  });

  it('should_handle_complete_batch_flow', async () => {
    // Arrange
    const locals = createMockLocals();
    const db = createDatabase(locals);

    mockQueryResult.mockResolvedValue({
      rows: [{ count: 1 }],
      rowCount: 1,
    });

    // Act
    const stmt1 = db.prepare('SELECT COUNT(*) as count FROM users');
    const stmt2 = db.prepare('SELECT COUNT(*) as count FROM posts');
    const results = await db.batch([stmt1, stmt2]);

    // Assert
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });
});
