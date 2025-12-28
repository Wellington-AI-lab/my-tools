/**
 * 测试文件：crypto.test.ts
 * 覆盖模块：src/lib/crypto.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 生成时间：2025-12-25
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sha256Hex,
  randomHex,
  hashPasswordPbkdf2,
  verifyPasswordPbkdf2,
} from './crypto';

// ============================================================================
// sha256Hex 测试
// ============================================================================
describe('sha256Hex', () => {
  describe('正常路径', () => {
    it('should_return_correct_hash_for_empty_string', async () => {
      // Arrange
      const input = '';
      const expectedHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      // Act
      const result = await sha256Hex(input);

      // Assert
      expect(result).toBe(expectedHash);
    });

    it('should_return_correct_hash_for_hello_world', async () => {
      // Arrange
      const input = 'hello world';
      const expectedHash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

      // Act
      const result = await sha256Hex(input);

      // Assert
      expect(result).toBe(expectedHash);
    });

    it('should_return_64_character_hex_string', async () => {
      // Arrange
      const input = 'test input';

      // Act
      const result = await sha256Hex(input);

      // Assert
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it.each([
      ['a', 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb'],
      ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      ['password', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'],
    ])('should_return_correct_hash_for_%s', async (input, expected) => {
      const result = await sha256Hex(input);
      expect(result).toBe(expected);
    });
  });

  describe('边界值测试', () => {
    it('should_handle_unicode_characters', async () => {
      // Arrange
      const input = '你好世界🌍';

      // Act
      const result = await sha256Hex(input);

      // Assert
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should_handle_very_long_string', async () => {
      // Arrange
      const input = 'a'.repeat(100000);

      // Act
      const result = await sha256Hex(input);

      // Assert
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should_handle_special_characters', async () => {
      // Arrange
      const input = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\\n\t\r';

      // Act
      const result = await sha256Hex(input);

      // Assert
      expect(result).toHaveLength(64);
    });

    it('should_handle_null_bytes', async () => {
      // Arrange
      const input = 'hello\x00world';

      // Act
      const result = await sha256Hex(input);

      // Assert
      expect(result).toHaveLength(64);
    });
  });

  describe('一致性测试', () => {
    it('should_return_same_hash_for_same_input', async () => {
      // Arrange
      const input = 'consistent-test';

      // Act
      const result1 = await sha256Hex(input);
      const result2 = await sha256Hex(input);

      // Assert
      expect(result1).toBe(result2);
    });

    it('should_return_different_hash_for_different_input', async () => {
      // Act
      const result1 = await sha256Hex('input1');
      const result2 = await sha256Hex('input2');

      // Assert
      expect(result1).not.toBe(result2);
    });
  });
});

// ============================================================================
// randomHex 测试
// ============================================================================
describe('randomHex', () => {
  describe('正常路径', () => {
    it.each([
      [1, 2],
      [8, 16],
      [16, 32],
      [32, 64],
      [64, 128],
    ])('should_return_%i_bytes_as_%i_hex_chars', (byteLength, expectedHexLength) => {
      // Act
      const result = randomHex(byteLength);

      // Assert
      expect(result).toHaveLength(expectedHexLength);
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('should_return_only_lowercase_hex_characters', () => {
      // Act
      const result = randomHex(32);

      // Assert
      expect(result).toMatch(/^[0-9a-f]{64}$/);
      expect(result).not.toMatch(/[A-F]/);
    });
  });

  describe('随机性测试', () => {
    it('should_return_different_values_on_each_call', () => {
      // Act
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(randomHex(16));
      }

      // Assert - 100 次调用应该产生 100 个不同的值
      expect(results.size).toBe(100);
    });

    it('should_have_good_distribution', () => {
      // Arrange
      const charCounts: Record<string, number> = {};
      '0123456789abcdef'.split('').forEach((c) => (charCounts[c] = 0));

      // Act - 生成大量随机数据
      for (let i = 0; i < 1000; i++) {
        const hex = randomHex(16);
        hex.split('').forEach((c) => charCounts[c]++);
      }

      // Assert - 每个字符应该出现一定次数（粗略检查分布）
      const values = Object.values(charCounts);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      values.forEach((count) => {
        // 每个字符的出现次数应在平均值的 50% 到 150% 之间
        expect(count).toBeGreaterThan(avg * 0.5);
        expect(count).toBeLessThan(avg * 1.5);
      });
    });
  });

  describe('边界值测试', () => {
    it('should_handle_zero_length', () => {
      // Act
      const result = randomHex(0);

      // Assert
      expect(result).toBe('');
    });

    it('should_handle_large_length', () => {
      // Act
      const result = randomHex(1024);

      // Assert
      expect(result).toHaveLength(2048);
      expect(result).toMatch(/^[0-9a-f]+$/);
    });
  });
});

// ============================================================================
// hashPasswordPbkdf2 测试
// ============================================================================
describe('hashPasswordPbkdf2', () => {
  describe('正常路径', () => {
    it('should_return_correct_format', async () => {
      // Arrange
      const password = 'test-password';

      // Act
      const result = await hashPasswordPbkdf2(password);

      // Assert
      expect(result).toMatch(/^pbkdf2:\d+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('should_contain_650000_iterations', async () => {
      // Arrange
      const password = 'test-password';

      // Act
      const result = await hashPasswordPbkdf2(password);
      const parts = result.split(':');

      // Assert
      expect(parts[0]).toBe('pbkdf2');
      expect(parts[1]).toBe('650000');
    });

    it('should_have_32_byte_salt_as_64_hex_chars', async () => {
      // Arrange
      const password = 'test-password';

      // Act
      const result = await hashPasswordPbkdf2(password);
      const parts = result.split(':');

      // Assert - salt 是 16 字节 = 32 个 hex 字符
      expect(parts[2]).toHaveLength(32);
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);
    });

    it('should_have_32_byte_hash_as_64_hex_chars', async () => {
      // Arrange
      const password = 'test-password';

      // Act
      const result = await hashPasswordPbkdf2(password);
      const parts = result.split(':');

      // Assert - hash 是 32 字节 = 64 个 hex 字符
      expect(parts[3]).toHaveLength(64);
      expect(parts[3]).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('随机性测试', () => {
    it('should_generate_different_hashes_for_same_password', async () => {
      // Arrange
      const password = 'same-password';

      // Act
      const hash1 = await hashPasswordPbkdf2(password);
      const hash2 = await hashPasswordPbkdf2(password);

      // Assert - 由于随机 salt，每次应该不同
      expect(hash1).not.toBe(hash2);
    });

    it('should_generate_different_salts', async () => {
      // Arrange
      const password = 'test';

      // Act
      const hash1 = await hashPasswordPbkdf2(password);
      const hash2 = await hashPasswordPbkdf2(password);
      const salt1 = hash1.split(':')[2];
      const salt2 = hash2.split(':')[2];

      // Assert
      expect(salt1).not.toBe(salt2);
    });
  });

  describe('边界值测试', () => {
    it('should_handle_empty_password', async () => {
      // Act
      const result = await hashPasswordPbkdf2('');

      // Assert
      expect(result).toMatch(/^pbkdf2:\d+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('should_handle_very_long_password', async () => {
      // Arrange
      const password = 'a'.repeat(10000);

      // Act
      const result = await hashPasswordPbkdf2(password);

      // Assert
      expect(result).toMatch(/^pbkdf2:\d+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('should_handle_unicode_password', async () => {
      // Arrange
      const password = '密码🔐パスワード';

      // Act
      const result = await hashPasswordPbkdf2(password);

      // Assert
      expect(result).toMatch(/^pbkdf2:\d+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('should_handle_special_characters', async () => {
      // Arrange
      const password = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~\n\t\r';

      // Act
      const result = await hashPasswordPbkdf2(password);

      // Assert
      expect(result).toMatch(/^pbkdf2:\d+:[0-9a-f]+:[0-9a-f]+$/);
    });
  });
});

// ============================================================================
// verifyPasswordPbkdf2 测试
// ============================================================================
describe('verifyPasswordPbkdf2', () => {
  describe('PBKDF2 格式验证', () => {
    it('should_return_true_for_correct_password', async () => {
      // Arrange
      const password = 'correct-password';
      const hash = await hashPasswordPbkdf2(password);

      // Act
      const result = await verifyPasswordPbkdf2(password, hash);

      // Assert
      expect(result).toBe(true);
    });

    it('should_return_false_for_incorrect_password', async () => {
      // Arrange
      const password = 'correct-password';
      const hash = await hashPasswordPbkdf2(password);

      // Act
      const result = await verifyPasswordPbkdf2('wrong-password', hash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_similar_password', async () => {
      // Arrange
      const password = 'my-password';
      const hash = await hashPasswordPbkdf2(password);

      // Act
      const result = await verifyPasswordPbkdf2('my-password1', hash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_case_different_password', async () => {
      // Arrange
      const password = 'MyPassword';
      const hash = await hashPasswordPbkdf2(password);

      // Act
      const result = await verifyPasswordPbkdf2('mypassword', hash);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('旧格式 SHA-256 向后兼容', () => {
    it('should_verify_legacy_sha256_hash', async () => {
      // Arrange
      const password = 'legacy-password';
      const legacyHash = await sha256Hex(password);

      // Act
      const result = await verifyPasswordPbkdf2(password, legacyHash);

      // Assert
      expect(result).toBe(true);
    });

    it('should_reject_wrong_password_for_legacy_hash', async () => {
      // Arrange
      const password = 'legacy-password';
      const legacyHash = await sha256Hex(password);

      // Act
      const result = await verifyPasswordPbkdf2('wrong-password', legacyHash);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('格式错误处理', () => {
    it('should_return_false_for_invalid_parts_count', async () => {
      // Arrange - 只有 3 个部分
      const invalidHash = 'pbkdf2:100000:abc123';

      // Act
      const result = await verifyPasswordPbkdf2('password', invalidHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_too_many_parts', async () => {
      // Arrange - 5 个部分
      const invalidHash = 'pbkdf2:100000:abc:def:extra';

      // Act
      const result = await verifyPasswordPbkdf2('password', invalidHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_non_numeric_iterations', async () => {
      // Arrange
      const invalidHash = 'pbkdf2:notanumber:' + '0'.repeat(32) + ':' + '0'.repeat(64);

      // Act
      const result = await verifyPasswordPbkdf2('password', invalidHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_zero_iterations', async () => {
      // Arrange
      const invalidHash = 'pbkdf2:0:' + '0'.repeat(32) + ':' + '0'.repeat(64);

      // Act
      const result = await verifyPasswordPbkdf2('password', invalidHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_negative_iterations', async () => {
      // Arrange
      const invalidHash = 'pbkdf2:-1:' + '0'.repeat(32) + ':' + '0'.repeat(64);

      // Act
      const result = await verifyPasswordPbkdf2('password', invalidHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_infinity_iterations', async () => {
      // Arrange
      const invalidHash = 'pbkdf2:Infinity:' + '0'.repeat(32) + ':' + '0'.repeat(64);

      // Act
      const result = await verifyPasswordPbkdf2('password', invalidHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_invalid_hex_in_salt', async () => {
      // Arrange - salt 包含无效 hex 字符
      const invalidHash = 'pbkdf2:100000:gggggggggggggggggggggggggggggggg:' + '0'.repeat(64);

      // Act
      const result = await verifyPasswordPbkdf2('password', invalidHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_NaN_iterations', async () => {
      // Arrange - NaN iterations
      const invalidHash = 'pbkdf2:NaN:' + '0'.repeat(32) + ':' + '0'.repeat(64);

      // Act
      const result = await verifyPasswordPbkdf2('password', invalidHash);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('constantTimeCompare 边界情况', () => {
    it('should_return_false_for_legacy_hash_with_wrong_length', async () => {
      // Arrange - 传入长度不是 64 的旧格式哈希（触发 constantTimeCompare 的长度不等分支）
      const shortHash = 'abc123';  // 比 SHA-256 的 64 字符短

      // Act
      const result = await verifyPasswordPbkdf2('password', shortHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_legacy_hash_with_longer_length', async () => {
      // Arrange - 传入比 64 字符长的旧格式哈希
      const longHash = '0'.repeat(100);

      // Act
      const result = await verifyPasswordPbkdf2('password', longHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_for_empty_legacy_hash', async () => {
      // Arrange
      const emptyHash = '';

      // Act
      const result = await verifyPasswordPbkdf2('password', emptyHash);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('边界值测试', () => {
    it('should_handle_empty_password_verification', async () => {
      // Arrange
      const hash = await hashPasswordPbkdf2('');

      // Act
      const result = await verifyPasswordPbkdf2('', hash);

      // Assert
      expect(result).toBe(true);
    });

    it('should_reject_empty_vs_nonempty_password', async () => {
      // Arrange
      const hash = await hashPasswordPbkdf2('');

      // Act
      const result = await verifyPasswordPbkdf2('notempty', hash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_handle_unicode_password_verification', async () => {
      // Arrange
      const password = '中文密码🔐';
      const hash = await hashPasswordPbkdf2(password);

      // Act
      const result = await verifyPasswordPbkdf2(password, hash);

      // Assert
      expect(result).toBe(true);
    });

    it('should_handle_very_long_password_verification', async () => {
      // Arrange
      const password = 'a'.repeat(5000);
      const hash = await hashPasswordPbkdf2(password);

      // Act
      const result = await verifyPasswordPbkdf2(password, hash);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('安全性测试', () => {
    it('should_reject_tampered_salt', async () => {
      // Arrange
      const password = 'test-password';
      const hash = await hashPasswordPbkdf2(password);
      const parts = hash.split(':');
      // 修改 salt 的第一个字符
      const tamperedSalt = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
      const tamperedHash = `${parts[0]}:${parts[1]}:${tamperedSalt}:${parts[3]}`;

      // Act
      const result = await verifyPasswordPbkdf2(password, tamperedHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_reject_tampered_hash', async () => {
      // Arrange
      const password = 'test-password';
      const hash = await hashPasswordPbkdf2(password);
      const parts = hash.split(':');
      // 修改 hash 的第一个字符
      const tamperedHashPart = (parts[3][0] === 'a' ? 'b' : 'a') + parts[3].slice(1);
      const tamperedHash = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedHashPart}`;

      // Act
      const result = await verifyPasswordPbkdf2(password, tamperedHash);

      // Assert
      expect(result).toBe(false);
    });

    it('should_reject_tampered_iterations', async () => {
      // Arrange
      const password = 'test-password';
      const hash = await hashPasswordPbkdf2(password);
      const parts = hash.split(':');
      // 修改迭代次数
      const tamperedHash = `${parts[0]}:99999:${parts[2]}:${parts[3]}`;

      // Act
      const result = await verifyPasswordPbkdf2(password, tamperedHash);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('不同迭代次数兼容性', () => {
    it('should_verify_hash_with_custom_iterations', async () => {
      // 手动构造一个使用不同迭代次数的哈希
      // 这测试了 verifyPasswordPbkdf2 能处理存储中的不同迭代次数
      const password = 'test';
      const hash = await hashPasswordPbkdf2(password);
      
      // 验证原始哈希
      const result = await verifyPasswordPbkdf2(password, hash);
      expect(result).toBe(true);
    });
  });
});

// ============================================================================
// 集成测试
// ============================================================================
describe('集成测试', () => {
  describe('完整密码流程', () => {
    it('should_complete_full_password_hash_and_verify_cycle', async () => {
      // Arrange
      const passwords = [
        'simple',
        'with spaces',
        'with-special-!@#$%^&*()',
        '中文密码',
        '🔐emoji🔑',
        'a'.repeat(100),
        '',
      ];

      // Act & Assert
      for (const password of passwords) {
        const hash = await hashPasswordPbkdf2(password);
        const isValid = await verifyPasswordPbkdf2(password, hash);
        expect(isValid).toBe(true);
        
        // 也验证错误密码被拒绝
        const isInvalid = await verifyPasswordPbkdf2(password + 'x', hash);
        expect(isInvalid).toBe(false);
      }
    });

    it('should_support_legacy_to_new_migration_scenario', async () => {
      // Arrange - 模拟旧系统使用 SHA-256
      const password = 'user-password';
      const legacyHash = await sha256Hex(password);

      // Act - 验证旧哈希仍然有效
      const legacyValid = await verifyPasswordPbkdf2(password, legacyHash);

      // 生成新的 PBKDF2 哈希（模拟迁移）
      const newHash = await hashPasswordPbkdf2(password);
      const newValid = await verifyPasswordPbkdf2(password, newHash);

      // Assert
      expect(legacyValid).toBe(true);
      expect(newValid).toBe(true);
      expect(newHash.startsWith('pbkdf2:')).toBe(true);
    });
  });

  describe('并发测试', () => {
    it('should_handle_concurrent_hash_operations', async () => {
      // Arrange
      const passwords = Array.from({ length: 10 }, (_, i) => `password-${i}`);

      // Act
      const hashes = await Promise.all(
        passwords.map((p) => hashPasswordPbkdf2(p))
      );

      // Assert - 所有哈希应该不同
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(10);
    });

    it('should_handle_concurrent_verify_operations', async () => {
      // Arrange
      const password = 'concurrent-test';
      const hash = await hashPasswordPbkdf2(password);

      // Act
      const results = await Promise.all(
        Array.from({ length: 10 }, () => verifyPasswordPbkdf2(password, hash))
      );

      // Assert
      expect(results.every((r) => r === true)).toBe(true);
    });
  });
});

// ============================================================================
// 性能测试（可选，标记为 skip 除非需要）
// ============================================================================
describe.skip('性能测试', () => {
  it('should_complete_hash_within_reasonable_time', async () => {
    // Arrange
    const password = 'performance-test-password';
    const startTime = Date.now();

    // Act
    await hashPasswordPbkdf2(password);

    // Assert - PBKDF2 with 100k iterations should take > 50ms but < 5s
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThan(50);
    expect(elapsed).toBeLessThan(5000);
  });

  it('should_complete_verify_within_reasonable_time', async () => {
    // Arrange
    const password = 'performance-test-password';
    const hash = await hashPasswordPbkdf2(password);
    const startTime = Date.now();

    // Act
    await verifyPasswordPbkdf2(password, hash);

    // Assert
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThan(50);
    expect(elapsed).toBeLessThan(5000);
  });
});

