function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

// PBKDF2 密码哈希（安全存储密码）
// 格式: pbkdf2:iterations:salt_hex:hash_hex
// 在 Apple Silicon M 系列芯片上，100k 迭代仅需 ~8ms
// 为确保抗暴力破解时间 ≥50ms，设置为 650k
const PBKDF2_ITERATIONS = 650000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BYTES = 32;

export async function hashPasswordPbkdf2(password: string): Promise<string> {
  const salt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(salt);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8
  );

  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(new Uint8Array(hash));
  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

export async function verifyPasswordPbkdf2(password: string, stored: string): Promise<boolean> {
  // 支持旧格式（纯 SHA-256 hex）以便向后兼容
  if (!stored.startsWith('pbkdf2:')) {
    // 旧格式：直接比较 SHA-256
    const inputHash = await sha256Hex(password);
    return constantTimeCompare(inputHash, stored);
  }

  // 新格式：pbkdf2:iterations:salt:hash
  const parts = stored.split(':');
  if (parts.length !== 4) return false;

  const iterations = parseInt(parts[1], 10);
  const saltHex = parts[2];
  const storedHashHex = parts[3];

  if (!Number.isFinite(iterations) || iterations < 1) return false;

  let salt: Uint8Array;
  try {
    salt = hexToBytes(saltHex);
  } catch {
    return false;
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8
  );

  const computedHashHex = bytesToHex(new Uint8Array(hash));
  return constantTimeCompare(computedHashHex, storedHashHex);
}

// 恒定时间字符串比较，防止时序攻击
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // 仍然执行比较以消耗相似时间
    let diff = 1;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ a.charCodeAt(i);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}


