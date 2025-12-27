/**
 * Session cookie signing / verification (Edge + Node compatible).
 *
 * Format: base64url(json) + "." + base64url(hmac_sha256(json))
 *
 * Rationale:
 * - Middleware runs on Edge runtime: cannot rely on Node's `crypto` module.
 * - Use WebCrypto (`globalThis.crypto.subtle`) which is available in Edge and modern Node.
 */

export type SessionPayload = {
  token: string;
  expiresAt: string; // ISO string
  role: 'user' | 'admin';
};

function toBase64Url(bytes: Uint8Array): string {
  // Prefer Buffer in Node, otherwise fall back to btoa (Edge).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BufferAny = (globalThis as any).Buffer as
    | typeof Buffer
    | undefined;
  if (BufferAny) {
    return BufferAny.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  // btoa expects binary string
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64UrlToBytes(s: string): Uint8Array {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
  // pad
  const padded = base64 + '==='.slice((base64.length + 3) % 4);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BufferAny = (globalThis as any).Buffer as
    | typeof Buffer
    | undefined;
  if (BufferAny) {
    return new Uint8Array(BufferAny.from(padded, 'base64'));
  }

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

/**
 * Encode and sign session payload.
 */
export async function encodeSession(payload: SessionPayload, secret: string): Promise<string> {
  const json = JSON.stringify(payload);
  const jsonB64 = toBase64Url(new TextEncoder().encode(json));
  const sig = await hmacSha256(secret, json);
  const sigB64 = toBase64Url(sig);
  return `${jsonB64}.${sigB64}`;
}

/**
 * Verify and decode session payload. Returns null if invalid.
 */
export async function decodeSession(value: string, secret: string): Promise<SessionPayload | null> {
  if (!value) return null;
  const idx = value.lastIndexOf('.');
  if (idx <= 0) return null;

  const jsonB64 = value.slice(0, idx);
  const sigB64 = value.slice(idx + 1);

  let json: string;
  try {
    const jsonBytes = fromBase64UrlToBytes(jsonB64);
    json = new TextDecoder().decode(jsonBytes);
  } catch {
    return null;
  }

  let providedSig: Uint8Array;
  try {
    providedSig = fromBase64UrlToBytes(sigB64);
  } catch {
    return null;
  }

  const expectedSig = await hmacSha256(secret, json);
  if (!constantTimeEqual(providedSig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(json) as SessionPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'string') return null;
    if (parsed.role !== 'user' && parsed.role !== 'admin') return null;
    return parsed;
  } catch {
    return null;
  }
}


