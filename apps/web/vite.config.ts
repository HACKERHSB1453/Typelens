import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string };

// Port 5173 matches the extension bridge's allowed origins (apps/extension/src/bridge-origins.ts).
// Bound to localhost only: the dashboard is for this computer, not the local network.
export default defineConfig({
  plugins: [react()],
  // The desktop app serves the build from app://typelens/ (assets resolve from the root) and the web build from
  // any origin root, so base stays '/' and index.html uses no inline scripts (the desktop CSP forbids them).
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: 'localhost',
    strictPort: true,
    fs: {
      // npm workspaces hoist packages (e.g. the Hack font files, @typelens/core) to the monorepo root
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  preview: {
    port: 5173,
    host: 'localhost',
  },
});
