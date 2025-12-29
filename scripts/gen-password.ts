// Generate password hash and session secret for Vercel
import { hashPasswordPbkdf2, randomHex } from '../src/lib/crypto';

async function main() {
  const password = '8z_rNd8iDkns2tjc7oB-HCZuX';

  // Generate password hash
  const passwordHash = await hashPasswordPbkdf2(password);
  console.log('SITE_PASSWORD_HASH=' + passwordHash);

  // Generate session secret (64 hex chars = 32 bytes)
  const sessionSecret = randomHex(32);
  console.log('SESSION_SECRET=' + sessionSecret);
}

main();
