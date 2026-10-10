import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // the dashboard's own import alias (apps/web/vite.config.ts), so its modules can be tested from here
    alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
  },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/extension/test/**/*.test.ts',
      'apps/web/test/**/*.test.ts',
      'apps/desktop/test/**/*.test.ts',
    ],
  },
});
