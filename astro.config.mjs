import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // Reuse our single KV binding for Astro's optional session store.
    // This avoids requiring an extra KV namespace binding named "SESSION".
    sessionKVBindingName: 'KV',
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


