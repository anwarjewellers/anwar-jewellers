import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` serves the website on :5173 and forwards /api and /images
// to the Cloudflare functions started with `npm run dev:api` (port 8788).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8788',
      '/images': 'http://127.0.0.1:8788',
      '/sitemap.xml': 'http://127.0.0.1:8788',
    },
  },
  build: { chunkSizeWarningLimit: 900 },
});
