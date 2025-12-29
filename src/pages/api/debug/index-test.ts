import type { APIRoute } from 'astro';
import { MODULES } from '@/config/modules';

export const GET: APIRoute = async (context) => {
  const results = {
    modulesCount: MODULES.length,
    modules: MODULES.map(m => ({
      id: m.id,
      name: m.name,
      href: m.href,
      status: m.status,
      adminOnly: m.adminOnly,
    })),
    userRole: context.locals.user?.role || 'none',
  };

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
