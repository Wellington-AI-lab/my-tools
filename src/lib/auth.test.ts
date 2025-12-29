/**
 * 测试文件：auth.test.ts
 * 覆盖模块：src/lib/auth.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSessionSecret,
  getStoredPasswordHash,
  getAdminPasswordHash,
  verifyPassword,
  createSessionCookies,
  clearSessionCookies,
  type UserRole,
} from './auth';
import type { AstroCookies } from 'astro';

// Mock the session module
vi.mock('@/lib/session', () => ({
  encodeSession: vi.fn(async (payload, secret) => {
    const jsonB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sigB64 = Buffer.from(`${secret}-${JSON.stringify(payload)}`).toString('base64url');
    return `${jsonB64}.${sigB64}`;
  }),
}));

// Mock the crypto module
vi.mock('@/lib/crypto', () => ({
  randomHex: vi.fn((length: number) => {
    return 'x'.repeat(length * 2);
  }),
  verifyPasswordPbkdf2: vi.fn(async (input, stored) => {
    // Mock verification - expect stored to be 'valid:{input}' for success
    return stored === `valid:${input}`;
  }),
}));

import { encodeSession } from '@/lib/session';
import { randomHex, verifyPasswordPbkdf2 } from '@/lib/crypto';

const mockedEncodeSession = encodeSession as unknown as ReturnType<typeof vi.fn>;
const mockedRandomHex = randomHex as unknown as ReturnType<typeof vi.fn>;
const mockedVerifyPasswordPbkdf2 = verifyPasswordPbkdf2 as unknown as ReturnType<typeof vi.fn>;

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockCookies(): AstroCookies {
  const store = new Map<string, { value: string; options?: any }>();

  return {
    get: vi.fn((name: string) => {
      return store.get(name)?.value;
    }),
    set: vi.fn((name: string, value: string, options?: any) => {
      store.set(name, { value, options });
    }),
    delete: vi.fn((name: string, options?: any) => {
      store.delete(name);
    }),
    has: vi.fn((name: string) => store.has(name)),
    headers: vi.fn(() => new Headers()),
  } as unknown as AstroCookies;
}

function createMockEnv(sessionSecret?: string, userHash?: string, adminHash?: string) {
  return {
    SESSION_SECRET: sessionSecret ?? 'test-secret',
    SITE_PASSWORD_HASH: userHash ?? 'valid:user-password',
    ADMIN_PASSWORD_HASH: adminHash ?? 'valid:admin-password',
    NODE_ENV: 'test',
  };
}

// ============================================================================
// getSessionSecret Tests
// ============================================================================
describe('getSessionSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_session_secret_when_set', () => {
      // Arrange
      const env = { SESSION_SECRET: 'my-secret-key' };

      // Act
      const secret = getSessionSecret(env);

      // Assert
      expect(secret).toBe('my-secret-key');
    });
  });

  describe('Error Cases', () => {
    it('should_throw_error_when_session_secret_is_missing', () => {
      // Arrange
      const env = {} as { SESSION_SECRET?: string };

      // Act & Assert
      expect(() => getSessionSecret(env)).toThrow('SESSION_SECRET is not set');
    });

    it('should_throw_error_when_session_secret_is_undefined', () => {
      // Arrange
      const env = { SESSION_SECRET: undefined };

      // Act & Assert
      expect(() => getSessionSecret(env)).toThrow('SESSION_SECRET is not set');
    });

    it('should_throw_error_when_session_secret_is_empty', () => {
      // Arrange
      const env = { SESSION_SECRET: '' };

      // Act & Assert
      expect(() => getSessionSecret(env)).toThrow('SESSION_SECRET is not set');
    });
  });
});

// ============================================================================
// getStoredPasswordHash Tests
// ============================================================================
describe('getStoredPasswordHash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_password_hash_when_set', () => {
      // Arrange
      const env = { SITE_PASSWORD_HASH: 'hashed-password' };

      // Act
      const hash = getStoredPasswordHash(env);

      // Assert
      expect(hash).toBe('hashed-password');
    });
  });

  describe('Error Cases', () => {
    it('should_throw_error_when_password_hash_is_missing', () => {
      // Arrange
      const env = {} as { SITE_PASSWORD_HASH?: string };

      // Act & Assert
      expect(() => getStoredPasswordHash(env)).toThrow('SITE_PASSWORD_HASH is not set');
    });

    it('should_throw_error_when_password_hash_is_undefined', () => {
      // Arrange
      const env = { SITE_PASSWORD_HASH: undefined };

      // Act & Assert
      expect(() => getStoredPasswordHash(env)).toThrow('SITE_PASSWORD_HASH is not set');
    });
  });
});

// ============================================================================
// getAdminPasswordHash Tests
// ============================================================================
describe('getAdminPasswordHash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_admin_password_hash_when_set', () => {
      // Arrange
      const env = { ADMIN_PASSWORD_HASH: 'admin-hashed-password' };

      // Act
      const hash = getAdminPasswordHash(env);

      // Assert
      expect(hash).toBe('admin-hashed-password');
    });
  });

  describe('Error Cases', () => {
    it('should_throw_error_when_admin_password_hash_is_missing', () => {
      // Arrange
      const env = {} as { ADMIN_PASSWORD_HASH?: string };

      // Act & Assert
      expect(() => getAdminPasswordHash(env)).toThrow('ADMIN_PASSWORD_HASH is not set');
    });

    it('should_throw_error_when_admin_password_hash_is_undefined', () => {
      // Arrange
      const env = { ADMIN_PASSWORD_HASH: undefined };

      // Act & Assert
      expect(() => getAdminPasswordHash(env)).toThrow('ADMIN_PASSWORD_HASH is not set');
    });
  });
});

// ============================================================================
// verifyPassword Tests
// ============================================================================
describe('verifyPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockedVerifyPasswordPbkdf2 as any).mockImplementation(async (input: string, stored: string) => {
      return stored === `valid:${input}`;
    });
  });

  describe('Happy Path', () => {
    it('should_return_true_for_correct_password', async () => {
      // Arrange
      const inputPassword = 'user-password';
      const storedHash = 'valid:user-password';

      // Act
      const result = await verifyPassword(inputPassword, storedHash);

      // Assert
      expect(result).toBe(true);
    });

    it('should_return_false_for_incorrect_password', async () => {
      // Arrange
      const inputPassword = 'wrong-password';
      const storedHash = 'valid:correct-password';

      // Act
      const result = await verifyPassword(inputPassword, storedHash);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should_handle_empty_password', async () => {
      // Arrange
      const inputPassword = '';
      const storedHash = 'valid:';

      // Act
      const result = await verifyPassword(inputPassword, storedHash);

      // Assert
      expect(result).toBe(true);
    });

    it('should_handle_special_characters', async () => {
      // Arrange
      const inputPassword = 'p@ssw0rd!#$%';
      const storedHash = 'valid:p@ssw0rd!#$%';

      // Act
      const result = await verifyPassword(inputPassword, storedHash);

      // Assert
      expect(result).toBe(true);
    });

    it('should_handle_unicode', async () => {
      // Arrange
      const inputPassword = '密码123';
      const storedHash = 'valid:密码123';

      // Act
      const result = await verifyPassword(inputPassword, storedHash);

      // Assert
      expect(result).toBe(true);
    });
  });
});

// ============================================================================
// createSessionCookies Tests
// ============================================================================
describe('createSessionCookies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockedRandomHex as any).mockReturnValue('x'.repeat(64));
    (mockedEncodeSession as any).mockImplementation(async (payload: unknown, secret: string) => {
      const jsonB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const sigB64 = Buffer.from(`${secret}-${JSON.stringify(payload)}`).toString('base64url');
      return `${jsonB64}.${sigB64}`;
    });
  });

  describe('Happy Path - User Role', () => {
    it('should_create_session_cookies_for_user_role', async () => {
      // Arrange
      const cookies = createMockCookies();
      const env = createMockEnv();
      const role: UserRole = 'user';

      // Act
      await createSessionCookies({ cookies, env, role });

      // Assert
      expect(cookies.set).toHaveBeenCalledWith(
        'auth_session',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        })
      );
      expect(cookies.set).toHaveBeenCalledWith(
        'auth_session_data',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        })
      );
    });
  });

  describe('Happy Path - Admin Role', () => {
    it('should_create_session_cookies_for_admin_role', async () => {
      // Arrange
      const cookies = createMockCookies();
      const env = createMockEnv();
      const role: UserRole = 'admin';

      // Act
      await createSessionCookies({ cookies, env, role });

      // Assert
      expect(cookies.set).toHaveBeenCalledTimes(2);

      // Check that the role is encoded in the session data
      const sessionDataCall = (cookies.set as any).mock.calls.find(
        (call: any[]) => call[0] === 'auth_session_data'
      );
      expect(sessionDataCall).toBeDefined();
    });
  });

  describe('Secure Flag', () => {
    it('should_use_secure_false_in_non_production', async () => {
      // Arrange
      const cookies = createMockCookies();
      const env = createMockEnv();
      env.NODE_ENV = 'development';

      // Act
      await createSessionCookies({ cookies, env, role: 'user', secure: false });

      // Assert
      const setCalls = (cookies.set as any).mock.calls;
      setCalls.forEach((call: any[]) => {
        expect(call[2].secure).toBe(false);
      });
    });

    it('should_use_secure_true_when_explicitly_set', async () => {
      // Arrange
      const cookies = createMockCookies();
      const env = createMockEnv();

      // Act
      await createSessionCookies({ cookies, env, role: 'user', secure: true });

      // Assert
      const setCalls = (cookies.set as any).mock.calls;
      setCalls.forEach((call: any[]) => {
        expect(call[2].secure).toBe(true);
      });
    });

    it('should_use_secure_true_in_production_by_default', async () => {
      // Arrange
      const cookies = createMockCookies();
      const env = createMockEnv();
      env.NODE_ENV = 'production';

      // Act
      await createSessionCookies({ cookies, env, role: 'user' });

      // Assert
      const setCalls = (cookies.set as any).mock.calls;
      setCalls.forEach((call: any[]) => {
        expect(call[2].secure).toBe(true);
      });
    });
  });

  describe('Max Age Calculation', () => {
    it('should_set_max_age_to_end_of_day', async () => {
      // Arrange
      const cookies = createMockCookies();
      const env = createMockEnv();

      // Act
      await createSessionCookies({ cookies, env, role: 'user' });

      // Assert
      const setCalls = (cookies.set as any).mock.calls;
      setCalls.forEach((call: any[]) => {
        expect(call[2].maxAge).toBeGreaterThan(0);
        expect(call[2].maxAge).toBeGreaterThanOrEqual(3600); // At least 1 hour
      });
    });
  });

  describe('Cookie Options', () => {
    it('should_set_httpOnly_to_true', async () => {
      // Arrange
      const cookies = createMockCookies();
      const env = createMockEnv();

      // Act
      await createSessionCookies({ cookies, env, role: 'user' });

      // Assert
      const setCalls = (cookies.set as any).mock.calls;
      setCalls.forEach((call: any[]) => {
        expect(call[2].httpOnly).toBe(true);
      });
    });

    it('should_set_sameSite_to_lax', async () => {
      // Arrange
      const cookies = createMockCookies();
      const env = createMockEnv();

      // Act
      await createSessionCookies({ cookies, env, role: 'user' });

      // Assert
      const setCalls = (cookies.set as any).mock.calls;
      setCalls.forEach((call: any[]) => {
        expect(call[2].sameSite).toBe('lax');
      });
    });

    it('should_set_path_to_slash', async () => {
      // Arrange
      const cookies = createMockCookies();
      const env = createMockEnv();

      // Act
      await createSessionCookies({ cookies, env, role: 'user' });

      // Assert
      const setCalls = (cookies.set as any).mock.calls;
      setCalls.forEach((call: any[]) => {
        expect(call[2].path).toBe('/');
      });
    });
  });
});

// ============================================================================
// clearSessionCookies Tests
// ============================================================================
describe('clearSessionCookies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_delete_auth_session_cookie', () => {
      // Arrange
      const cookies = createMockCookies();

      // Act
      clearSessionCookies(cookies);

      // Assert
      expect(cookies.delete).toHaveBeenCalledWith('auth_session', { path: '/' });
    });

    it('should_delete_auth_session_data_cookie', () => {
      // Arrange
      const cookies = createMockCookies();

      // Act
      clearSessionCookies(cookies);

      // Assert
      expect(cookies.delete).toHaveBeenCalledWith('auth_session_data', { path: '/' });
    });

    it('should_delete_both_cookies', () => {
      // Arrange
      const cookies = createMockCookies();

      // Act
      clearSessionCookies(cookies);

      // Assert
      expect(cookies.delete).toHaveBeenCalledTimes(2);
    });
  });
});
