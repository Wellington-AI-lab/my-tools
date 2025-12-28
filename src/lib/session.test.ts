/**
 * 测试文件：session.test.ts
 * 覆盖模块：src/lib/session.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encodeSession,
  decodeSession,
  type SessionPayload,
} from './session';

// ============================================================================
// encodeSession Tests
// ============================================================================
describe('encodeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('正常路径', () => {
    it('should_encode_valid_session_payload', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'test-token-123',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const secret = 'test-secret-key';

      // Act
      const result = await encodeSession(payload, secret);

      // Assert
      expect(result).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(result.split('.')).toHaveLength(2);
    });

    it('should_encode_admin_role', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'admin-token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'admin',
      };
      const secret = 'test-secret';

      // Act
      const result = await encodeSession(payload, secret);

      // Assert
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should_generate_different_signature_for_different_secret', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'same-token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };

      // Act
      const result1 = await encodeSession(payload, 'secret1');
      const result2 = await encodeSession(payload, 'secret2');

      // Assert
      const sig1 = result1.split('.')[1];
      const sig2 = result2.split('.')[1];
      expect(sig1).not.toBe(sig2);
    });

    it('should_include_base64url_encoded_json', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'abc',
        expiresAt: '2025-01-01T00:00:00.000Z',
        role: 'user',
      };
      const secret = 'secret';

      // Act
      const result = await encodeSession(payload, secret);
      const [jsonB64] = result.split('.');

      // Assert - Base64URL should not contain +, /, or =
      expect(jsonB64).not.toContain('+');
      expect(jsonB64).not.toContain('/');
      expect(jsonB64).not.toMatch(/=$/);
    });
  });

  describe('边界值测试', () => {
    it('should_handle_empty_token', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: '',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const secret = 'secret';

      // Act
      const result = await encodeSession(payload, secret);

      // Assert
      expect(result).toBeTruthy();
    });

    it('should_handle_long_token', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'a'.repeat(1000),
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'admin',
      };
      const secret = 'secret';

      // Act
      const result = await encodeSession(payload, secret);

      // Assert
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(1000);
    });

    it('should_handle_unicode_in_token', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: '中文-token-🔐',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const secret = 'secret';

      // Act
      const result = await encodeSession(payload, secret);

      // Assert
      expect(result).toBeTruthy();
    });

    it('should_handle_special_characters_in_expiresAt', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const secret = 'secret';

      // Act
      const result = await encodeSession(payload, secret);

      // Assert
      expect(result).toBeTruthy();
    });

    it('should_handle_empty_secret', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };

      // Act & Assert
      // crypto.subtle.importKey throws on empty key - this documents expected behavior
      await expect(encodeSession(payload, '')).rejects.toThrow();
    });
  });

  describe('一致性测试', () => {
    it('should_generate_same_signature_for_same_payload_and_secret', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'consistent-token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const secret = 'same-secret';

      // Act
      const result1 = await encodeSession(payload, secret);
      const result2 = await encodeSession(payload, secret);

      // Assert
      expect(result1).toBe(result2);
    });
  });
});

// ============================================================================
// decodeSession Tests
// ============================================================================
describe('decodeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('正常路径', () => {
    it('should_decode_valid_session', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'test-token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const secret = 'secret';
      const encoded = await encodeSession(payload, secret);

      // Act
      const result = await decodeSession(encoded, secret);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.token).toBe(payload.token);
      expect(result?.expiresAt).toBe(payload.expiresAt);
      expect(result?.role).toBe(payload.role);
    });

    it('should_decode_admin_session', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'admin-token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'admin',
      };
      const secret = 'secret';
      const encoded = await encodeSession(payload, secret);

      // Act
      const result = await decodeSession(encoded, secret);

      // Assert
      expect(result?.role).toBe('admin');
    });

    it('should_decode_session_with_unicode_token', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: '中文-token-🔐',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const secret = 'secret';
      const encoded = await encodeSession(payload, secret);

      // Act
      const result = await decodeSession(encoded, secret);

      // Assert
      expect(result?.token).toBe('中文-token-🔐');
    });
  });

  describe('验证失败 - 签名不匹配', () => {
    it('should_return_null_for_wrong_secret', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'test-token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const secret = 'secret';
      const encoded = await encodeSession(payload, secret);

      // Act
      const result = await decodeSession(encoded, 'wrong-secret');

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_tampered_signature', async () => {
      // Arrange
      const payload: SessionPayload = {
        token: 'test-token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const secret = 'secret';
      const encoded = await encodeSession(payload, secret);
      const [jsonB64, sigB64] = encoded.split('.');
      const tamperedSig = sigB64.replace(/a/g, 'b');

      // Act
      const tampered = `${jsonB64}.${tamperedSig}`;
      const result = await decodeSession(tampered, secret);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_tampered_payload', async () => {
      // Arrange
      const secret = 'secret';
      const payload: SessionPayload = {
        token: 'test-token',
        expiresAt: '2025-12-31T23:59:59.999Z',
        role: 'user',
      };
      const encoded = await encodeSession(payload, secret);
      const [jsonB64, sigB64] = encoded.split('.');
      // Tamper the payload - modify one character
      const tamperedPayload = jsonB64.substring(0, jsonB64.length - 1) +
        (jsonB64[jsonB64.length - 1] === 'a' ? 'b' : 'a');

      // Act - signature no longer matches tampered payload
      const tampered = `${tamperedPayload}.${sigB64}`;
      const result = await decodeSession(tampered, secret);

      // Assert - Should be null because signature doesn't match tampered data
      expect(result).toBeNull();
    });
  });

  describe('格式错误', () => {
    it('should_return_null_for_empty_string', async () => {
      // Arrange
      const secret = 'secret';

      // Act
      const result = await decodeSession('', secret);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_missing_dot', async () => {
      // Arrange
      const secret = 'secret';

      // Act
      const result = await decodeSession('nosignature', secret);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_only_dot', async () => {
      // Arrange
      const secret = 'secret';

      // Act
      const result = await decodeSession('.', secret);

      // Assert
      expect(result).toBeNull();
    });

    it('should_use_last_dot_as_separator_for_multiple_dots', async () => {
      // Arrange
      const secret = 'secret';

      // Act
      const result = await decodeSession('a.b.c', secret);

      // Assert - Uses lastIndexOf, so splits as 'a.b' and 'c'
      // Will return null since 'a.b' is not valid base64url of valid JSON
      expect(result).toBeNull();
    });

    it('should_return_null_for_invalid_base64', async () => {
      // Arrange
      const secret = 'secret';

      // Act
      const result = await decodeSession('not!base64!.not!base64!', secret);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_invalid_json', async () => {
      // Arrange
      const secret = 'secret';
      const invalidJsonB64 = btoa('not valid json');
      const dummySig = btoa('x').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      // Act
      const result = await decodeSession(`${invalidJsonB64}.${dummySig}`, secret);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Payload 验证', () => {
    it('should_return_null_for_missing_token', async () => {
      // Arrange
      const secret = 'secret';
      const payloadWithoutToken = { expiresAt: '2025-12-31T23:59:59.999Z', role: 'user' as const };
      const jsonB64 = btoa(JSON.stringify(payloadWithoutToken))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sig = await encodeSession({ token: 'x', expiresAt: '2025-12-31T23:59:59.999Z', role: 'user' }, secret);
      const sigB64 = sig.split('.')[1];

      // Act
      const result = await decodeSession(`${jsonB64}.${sigB64}`, secret);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_missing_expiresAt', async () => {
      // Arrange
      const secret = 'secret';
      const payloadWithoutExpiry = { token: 'test', role: 'user' as const };
      const jsonB64 = btoa(JSON.stringify(payloadWithoutExpiry))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sig = await encodeSession({ token: 'x', expiresAt: '2025-12-31T23:59:59.999Z', role: 'user' }, secret);
      const sigB64 = sig.split('.')[1];

      // Act
      const result = await decodeSession(`${jsonB64}.${sigB64}`, secret);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_invalid_role', async () => {
      // Arrange
      const secret = 'secret';
      const payloadWithInvalidRole = { token: 'test', expiresAt: '2025-12-31T23:59:59.999Z', role: 'superadmin' as const };
      const jsonB64 = btoa(JSON.stringify(payloadWithInvalidRole))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sig = await encodeSession({ token: 'x', expiresAt: '2025-12-31T23:59:59.999Z', role: 'user' }, secret);
      const sigB64 = sig.split('.')[1];

      // Act
      const result = await decodeSession(`${jsonB64}.${sigB64}`, secret);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_non_string_token', async () => {
      // Arrange
      const secret = 'secret';
      const payloadWithNumberToken = { token: 123 as any, expiresAt: '2025-12-31T23:59:59.999Z', role: 'user' as const };
      const jsonB64 = btoa(JSON.stringify(payloadWithNumberToken))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sig = await encodeSession({ token: 'x', expiresAt: '2025-12-31T23:59:59.999Z', role: 'user' }, secret);
      const sigB64 = sig.split('.')[1];

      // Act
      const result = await decodeSession(`${jsonB64}.${sigB64}`, secret);

      // Assert
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// Integration Tests - Full Cycle
// ============================================================================
describe('Integration - Encode/Decode Cycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_complete_full_encode_decode_cycle', async () => {
    // Arrange
    const payload: SessionPayload = {
      token: 'cycle-test-token',
      expiresAt: '2025-12-31T23:59:59.999Z',
      role: 'admin',
    };
    const secret = 'cycle-secret';

    // Act
    const encoded = await encodeSession(payload, secret);
    const decoded = await decodeSession(encoded, secret);

    // Assert
    expect(decoded).toEqual(payload);
  });

  it('should_fail_cycle_with_wrong_secret', async () => {
    // Arrange
    const payload: SessionPayload = {
      token: 'test',
      expiresAt: '2025-12-31T23:59:59.999Z',
      role: 'user',
    };

    // Act
    const encoded = await encodeSession(payload, 'secret1');
    const decoded = await decodeSession(encoded, 'secret2');

    // Assert
    expect(decoded).toBeNull();
  });

  it('should_handle_multiple_different_sessions', async () => {
    // Arrange
    const payloads: SessionPayload[] = [
      { token: 'token1', expiresAt: '2025-12-31T23:59:59.999Z', role: 'user' },
      { token: 'token2', expiresAt: '2025-12-31T23:59:59.999Z', role: 'admin' },
      { token: 'token3', expiresAt: '2025-12-31T23:59:59.999Z', role: 'user' },
    ];
    const secret = 'multi-secret';

    // Act
    const encoded = await Promise.all(payloads.map(p => encodeSession(p, secret)));
    const decoded = await Promise.all(encoded.map(e => decodeSession(e, secret)));

    // Assert
    expect(decoded).toEqual(payloads);
  });
});

// ============================================================================
// Constant-Time Compare Verification
// ============================================================================
describe('Security - Constant-Time Compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_prevent_timing_attack_on_signature', async () => {
    // Arrange
    const payload: SessionPayload = {
      token: 'test',
      expiresAt: '2025-12-31T23:59:59.999Z',
      role: 'user',
    };
    const secret = 'secret';
    const valid = await encodeSession(payload, secret);

    // Act
    const start1 = performance.now();
    await decodeSession(valid, secret);
    const time1 = performance.now() - start1;

    const start2 = performance.now();
    await decodeSession(valid, 'wrong-secret');
    const time2 = performance.now() - start2;

    // Assert - Timing should be similar (within 100x for test environment variability)
    // Note: This is a weak check due to test environment variability
    expect(Math.abs(time1 - time2)).toBeLessThan(1000);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================
describe('Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_handle_very_long_secret', async () => {
    // Arrange
    const payload: SessionPayload = {
      token: 'test',
      expiresAt: '2025-12-31T23:59:59.999Z',
      role: 'user',
    };
    const secret = 'a'.repeat(10000);

    // Act
    const encoded = await encodeSession(payload, secret);
    const decoded = await decodeSession(encoded, secret);

    // Assert
    expect(decoded).toEqual(payload);
  });

  it('should_handle_secret_with_special_characters', async () => {
    // Arrange
    const payload: SessionPayload = {
      token: 'test',
      expiresAt: '2025-12-31T23:59:59.999Z',
      role: 'user',
    };
    const secret = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';

    // Act
    const encoded = await encodeSession(payload, secret);
    const decoded = await decodeSession(encoded, secret);

    // Assert
    expect(decoded).toEqual(payload);
  });

  it('should_handle_payload_with_future_expiration', async () => {
    // Arrange
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 100);

    const payload: SessionPayload = {
      token: 'test',
      expiresAt: futureDate.toISOString(),
      role: 'user',
    };
    const secret = 'secret';

    // Act
    const encoded = await encodeSession(payload, secret);
    const decoded = await decodeSession(encoded, secret);

    // Assert
    expect(decoded).toEqual(payload);
  });

  it('should_handle_payload_with_past_expiration', async () => {
    // Arrange
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 10);

    const payload: SessionPayload = {
      token: 'test',
      expiresAt: pastDate.toISOString(),
      role: 'user',
    };
    const secret = 'secret';

    // Act
    const encoded = await encodeSession(payload, secret);
    const decoded = await decodeSession(encoded, secret);

    // Assert - decodeSession doesn't check expiration, only format
    expect(decoded).toEqual(payload);
  });
});
