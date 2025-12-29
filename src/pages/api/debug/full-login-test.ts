import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import {
  createSessionCookies,
  getStoredPasswordHash,
  verifyPassword,
} from '@/lib/auth';

const bodySchema = z.object({
  password: z.string().min(1),
});

export const POST: APIRoute = async (context) => {
  const debugInfo: any = {
    steps: [],
  };

  try {
    debugInfo.steps.push('1. Start');

    const env = getEnv(context.locals);
    debugInfo.steps.push('2. Got env');

    const body = bodySchema.safeParse(await context.request.json().catch(() => ({})));
    debugInfo.steps.push('3. Parsed body');
    debugInfo.bodySuccess = body.success;

    if (!body.success) {
      return new Response(JSON.stringify({ debugInfo, error: 'Body parse failed' }), { status: 400 });
    }

    debugInfo.steps.push('4. Getting stored hash');
    const storedUserHash = getStoredPasswordHash(env);
    debugInfo.steps.push('5. Got hash');
    debugInfo.hashPrefix = storedUserHash.substring(0, 50);
    debugInfo.hashSuffix = storedUserHash.substring(storedUserHash.length - 20);

    const inputPassword = body.data.password;
    debugInfo.inputPassword = inputPassword;
    debugInfo.passwordLength = inputPassword.length;
    debugInfo.passwordBytes = Array.from(new TextEncoder().encode(inputPassword));

    // Direct hash for comparison
    debugInfo.steps.push('6. Verifying password');
    const isUser = await verifyPassword(inputPassword, storedUserHash);
    debugInfo.steps.push('7. Verification done');
    debugInfo.isUser = isUser;

    // Also try with hardcoded password
    const hardcodedPassword = '8z_rNd8iDkns2tjc7oB-HCZuX';
    const isUserHardcoded = await verifyPassword(hardcodedPassword, storedUserHash);
    debugInfo.isUserHardcoded = isUserHardcoded;
    debugInfo.hardcodedPassword = hardcodedPassword;

    if (!isUser) {
      return new Response(JSON.stringify({ debugInfo, error: 'Password incorrect' }), { status: 200 });
    }

    debugInfo.steps.push('8. Success');
    return new Response(JSON.stringify({ debugInfo, success: true }), { status: 200 });
  } catch (err: any) {
    debugInfo.error = err.message;
    debugInfo.errorStack = err.stack;
    return new Response(JSON.stringify({ debugInfo, error: 'Exception' }), { status: 500 });
  }
};
