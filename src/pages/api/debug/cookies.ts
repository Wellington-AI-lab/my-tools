import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
  const token = context.cookies.get('auth_session')?.value ?? null;
  const signed = context.cookies.get('auth_session_data')?.value ?? null;
  const user = (context.locals as any)?.user;

  return Response.json({
    hasToken: !!token,
    tokenPreview: token ? `${token.substring(0, 8)}...` : null,
    hasSigned: !!signed,
    signedPreview: signed ? `${signed.substring(0, 20)}...` : null,
    user: user || null,
    allCookies: Object.fromEntries(
      Object.entries(context.cookies).map(([k, v]) => [k, v?.value ? `${v.value.substring(0, 20)}...` : null])
    ),
  });
};
