/**
 * Generate PBKDF2 password hash (recommended for production)
 * 
 * Usage:
 *   node scripts/generate-password-hash-pbkdf2.mjs site <password>
 *   node scripts/generate-password-hash-pbkdf2.mjs admin <password>
 * 
 * Output format: pbkdf2:iterations:salt_hex:hash_hex
 * 
 * This is more secure than simple SHA-256 as it:
 * - Uses a random salt (防止彩虹表攻击)
 * - Uses key stretching with 100,000 iterations (增加暴力破解成本)
 */

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BYTES = 32;

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPasswordPbkdf2(password) {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));

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

// Main
const mode = (process.argv[2] || 'site').toLowerCase();
const password = process.argv[3];

if (!password) {
  console.error('Usage: node generate-password-hash-pbkdf2.mjs <site|admin> <password>');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/generate-password-hash-pbkdf2.mjs site "my-secure-password"');
  console.error('  node scripts/generate-password-hash-pbkdf2.mjs admin "admin-password"');
  process.exit(1);
}

const varName = mode === 'admin' ? 'ADMIN_PASSWORD_HASH' : 'SITE_PASSWORD_HASH';
const hash = await hashPasswordPbkdf2(password);

console.log(`${varName}=${hash}`);
console.log('');
console.log('Tip: Set this as a Cloudflare Pages Secret (Settings → Variables → Secrets).');
console.log('Note: Each run generates a different hash due to random salt - this is expected and secure.');

