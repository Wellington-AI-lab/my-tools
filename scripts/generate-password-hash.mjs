import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const mode = (process.argv[2] || 'site').toLowerCase();
const varName = mode === 'admin' ? 'ADMIN_PASSWORD_HASH' : 'SITE_PASSWORD_HASH';

const rl = readline.createInterface({ input, output });
try {
  const pwd = await rl.question(`Enter password for ${varName}: `, { hideEchoBack: true });
  output.write('\n');
  const hash = crypto.createHash('sha256').update(pwd, 'utf8').digest('hex');
  console.log(`${varName}=${hash}`);
  console.log('');
  console.log('Tip: set this as a Cloudflare Pages Secret (not a plain env var).');
} finally {
  rl.close();
}


