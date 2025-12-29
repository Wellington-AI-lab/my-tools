// Generate admin password hash for Vercel
import { hashPasswordPbkdf2 } from '../src/lib/crypto';

async function main() {
  const password = 'ug_q7.LX@Q@grMwwuHsnHXndo';
  const passwordHash = await hashPasswordPbkdf2(password);
  console.log('ADMIN_PASSWORD_HASH=' + passwordHash);
}

main();
