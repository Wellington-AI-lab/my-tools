import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'server',
  adapter: vercel({
    // Use Node.js runtime for database compatibility
    // Edge Runtime doesn't fully support @vercel/postgres
    edgeMiddleware: false,
    webAnalytics: {
      enabled: true,
    },
  }),
  integrations: [tailwind()],
  vite: {
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
});


