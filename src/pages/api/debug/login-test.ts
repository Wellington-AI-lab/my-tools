import type { APIRoute } from 'astro';
import { getEnv } from '@/lib/env';
import { verifyPassword } from '@/lib/auth';

const bodySchema = {
  password: '8z_rNd8iDkns2tjc7oB-HCZuX',
  hash: 'pbkdf2:650000:ffa38067a34f0f1f214adcb7be8ee916:08da2adeef191ee1184f3b27062b078d2f9bd74981e1f780c69f051d54dbc252',
};

export const POST: APIRoute = async (context) => {
  const env = getEnv(context.locals);

  const result = await verifyPassword(bodySchema.password, bodySchema.hash);

  return new Response(JSON.stringify({
    success: result,
    hashFromEnv: (env.SITE_PASSWORD_HASH as string || '').substring(0, 30),
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
