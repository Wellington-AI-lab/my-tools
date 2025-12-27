import crypto from 'node:crypto';

const mode = (process.argv[2] || 'site').toLowerCase();
const password = process.argv[3];

if (!password) {
  console.error('Usage: node generate-password-hash-direct.mjs <site|admin> <password>');
  process.exit(1);
}

const varName = mode === 'admin' ? 'ADMIN_PASSWORD_HASH' : 'SITE_PASSWORD_HASH';
const hash = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
console.log(`${varName}=${hash}`);

