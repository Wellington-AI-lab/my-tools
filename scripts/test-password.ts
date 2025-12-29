// Test password verification
import { verifyPasswordPbkdf2 } from '../src/lib/crypto.ts';

async function main() {
  const password = '8z_rNd8iDkns2tjc7oB-HCZuX';
  const hash = 'pbkdf2:650000:ffa38067a34f0f1f214adcb7be8ee916:08da2adeef191ee1184f3b27062b078d2f9bd74981e1f780c69f051d54dbc252';

  const result = await verifyPasswordPbkdf2(password, hash);
  console.log('Password verification result:', result);
}

main();
