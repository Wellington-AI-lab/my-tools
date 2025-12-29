/**
 * 测试文件：validation.test.ts
 * 覆盖模块：src/lib/validation.ts
 * 目标覆盖率：100% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeAndValidateSymbol } from './validation';

// ============================================================================
// normalizeAndValidateSymbol Tests
// ============================================================================
describe('normalizeAndValidateSymbol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path - Valid Symbols', () => {
    it('should_accept_single_letter_symbol', () => {
      // Arrange
      const input = 'a';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('A');
    });

    it('should_accept_standard_ticker', () => {
      // Arrange
      const input = 'AAPL';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('AAPL');
    });

    it('should_accept_lowercase_and_normalize', () => {
      // Arrange
      const input = 'googl';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('GOOGL');
    });

    it('should_accept_ticker_with_numbers', () => {
      // Arrange
      const input = 'BRK3';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('BRK3');
    });

    it('should_accept_ticker_with_hyphen', () => {
      // Arrange
      const input = 'brk-b';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('BRK-B');
    });

    it('should_accept_ticker_with_dot', () => {
      // Arrange
      const input = 'brk.b';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('BRK.B');
    });

    it('should_trim_whitespace', () => {
      // Arrange
      const input = '  aapl  ';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('AAPL');
    });

    it('should_accept_max_length_symbol', () => {
      // Arrange
      const input = 'ABCDEFGHIJKL'; // 1 + 11 = 12 chars (max allowed)

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('ABCDEFGHIJKL');
    });

    it('should_accept_mixed_case_with_special_chars', () => {
      // Arrange
      const input = 'BeR.sH-aRE';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('BER.SH-ARE');
    });
  });

  describe('Error Cases - Invalid Input', () => {
    it('should_return_null_for_non_string', () => {
      // Arrange
      const input = 123;

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_null', () => {
      // Arrange
      const input = null;

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_undefined', () => {
      // Arrange
      const input = undefined;

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_object', () => {
      // Arrange
      const input = { symbol: 'AAPL' };

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_array', () => {
      // Arrange
      const input = ['AAPL'];

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_boolean', () => {
      // Arrange
      const input = true;

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Error Cases - Invalid Symbols', () => {
    it('should_return_null_for_empty_string', () => {
      // Arrange
      const input = '';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_whitespace_only', () => {
      // Arrange
      const input = '   ';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_symbol_starting_with_number', () => {
      // Arrange
      const input = '3AAPL';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_symbol_starting_with_hyphen', () => {
      // Arrange
      const input = '-AAPL';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_symbol_starting_with_dot', () => {
      // Arrange
      const input = '.AAPL';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_symbol_too_long', () => {
      // Arrange
      const input = 'ABCDEFGHIJKLMN'; // 13 chars > 12

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_symbol_with_invalid_chars', () => {
      // Arrange
      const input = 'AAPL@';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_symbol_with_space', () => {
      // Arrange
      const input = 'AA PL';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_symbol_with_underscore', () => {
      // Arrange
      const input = 'AA_PL';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_symbol_with_slash', () => {
      // Arrange
      const input = 'AA/PL';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_null_for_symbol_with_plus', () => {
      // Arrange
      const input = 'AA+PL';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should_handle_single_lowercase_letter', () => {
      // Arrange
      const input = 'z';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('Z');
    });

    it('should_handle_ticker_with_multiple_hyphens', () => {
      // Arrange
      const input = 'A-B-C';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('A-B-C');
    });

    it('should_handle_ticker_with_multiple_dots', () => {
      // Arrange
      const input = 'A.B.C';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('A.B.C');
    });

    it('should_handle_mixed_hyphens_and_dots', () => {
      // Arrange
      const input = 'A-B.C';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('A-B.C');
    });

    it('should_handle_all_uppercase_input', () => {
      // Arrange
      const input = 'META';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('META');
    });

    it('should_handle_all_numbers_after_first_letter', () => {
      // Arrange
      const input = 'a123456789'; // 1 letter + 11 numbers = 12 chars

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('A123456789');
    });

    it('should_return_null_for_symbol_exactly_max_plus_one', () => {
      // Arrange
      const input = 'a123456789012'; // 1 + 12 = 13 chars (exceeds max of 12)

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Real-World Examples', () => {
    it('should_validate_berkshire_hathaway_class_b', () => {
      // Arrange
      const input = 'BRK.B';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('BRK.B');
    });

    it('should_validate_berkshire_hathaway_with_hyphen', () => {
      // Arrange
      const input = 'brk-b';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('BRK-B');
    });

    it('should_validate_google', () => {
      // Arrange
      const input = 'GOOGL';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('GOOGL');
    });

    it('should_validate_meta', () => {
      // Arrange
      const input = 'meta';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('META');
    });

    it('should_validate_tesla', () => {
      // Arrange
      const input = 'tsla';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('TSLA');
    });

    it('should_validate_amazon', () => {
      // Arrange
      const input = 'AMZN';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('AMZN');
    });

    it('should_validate_microsoft', () => {
      // Arrange
      const input = 'MSFT';

      // Act
      const result = normalizeAndValidateSymbol(input);

      // Assert
      expect(result).toBe('MSFT');
    });
  });
});
