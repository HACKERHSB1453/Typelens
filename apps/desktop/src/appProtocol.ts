/**
 * Serves the built dashboard over the privileged app://typelens/ scheme (instead of file://, so the page gets a
 * real origin, working pushState routing and a strict Content-Security-Policy). No Electron imports: testable.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'typelens';
export const APP_URL = `${APP_SCHEME}://${APP_HOST}/`;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React style={} attributes and Chart.js
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function createAppHandler(rendererRoot: string): (req: Request) => Promise<Response> {
  const root = path.resolve(rendererRoot);
  return async (req) => {
    const url = new URL(req.url);
    if (url.host !== APP_HOST) return new Response('not found', { status: 404 });
    let rel: string;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return new Response('bad request', { status: 400 });
    }
    if (rel.includes('\0')) return new Response('bad request', { status: 400 });
    let file = path.normalize(path.join(root, rel));
    if (file !== root && !file.startsWith(root + path.sep)) return new Response('forbidden', { status: 403 });
    let stat = await fsp.stat(file).catch(() => null);
    // client-side routes (/keys, /replay/abc...) all get the single page; missing assets stay 404
    if (!stat?.isFile()) {
      if (path.extname(rel)) return new Response('not found', { status: 404 });
      file = path.join(root, 'index.html');
      stat = await fsp.stat(file).catch(() => null);
      if (!stat) return new Response('renderer missing: run the build', { status: 500 });
    }
    const body = await fsp.readFile(file);
    return new Response(new Uint8Array(body), {
      headers: {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-security-policy': CSP,
        'x-content-type-options': 'nosniff',
        // hashed asset files never change; everything else (index.html) must be re-read
        'cache-control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    });
  };
}
