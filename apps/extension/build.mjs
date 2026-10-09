// Builds the extension into dist/ with esbuild (already a dependency of Vite).
//   node build.mjs           production-ish build
//   node build.mjs --watch   rebuild on change
import { build, context } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const watch = process.argv.includes('--watch');

// The manifest reads its network constants from the same source files the runtime uses, so it can never
// disagree with the runtime checks: bridge-origins.ts (web-app origins) and the desktop contract.
async function loadConstants(entry) {
  const out = path.join(dist, `.${path.basename(entry)}.mjs`);
  await build({ entryPoints: [entry], outfile: out, format: 'esm', bundle: true, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href + `?t=${Date.now()}`);
  fs.rmSync(out);
  return mod;
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const { BRIDGE_ORIGINS, MONKEYTYPE_ORIGIN } = await loadConstants(path.join(here, 'src/bridge-origins.ts'));
const { DESKTOP_ORIGIN } = await loadConstants(path.join(here, '../../packages/core/src/desktop.ts'));
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));

const manifest = {
  manifest_version: 3,
  name: 'TypeLens',
  version: pkg.version,
  description: 'Records Monkeytype tests and sends them only to the TypeLens app on this computer (127.0.0.1). Never the internet.',
  homepage_url: 'https://github.com/HACKERHSB1453/Typelens',
  minimum_chrome_version: '110',
  // scripting: attach the recorder to Monkeytype tabs already open at install time (host access is monkeytype.com only)
  // alarms: wake the service worker every minute to retry the desktop app
  permissions: ['storage', 'unlimitedStorage', 'scripting', 'alarms'],
  // the desktop app on this computer, plus monkeytype.com (needed to find and inject into already-open tabs)
  host_permissions: [`${DESKTOP_ORIGIN}/*`, `${MONKEYTYPE_ORIGIN}/*`],
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_title: 'TypeLens', default_popup: 'popup.html' },
  content_scripts: [
    { matches: ['https://monkeytype.com/*'], js: ['capture.js'], run_at: 'document_idle' },
    { matches: BRIDGE_ORIGINS.map((o) => `${o}/*`), js: ['bridge.js'], run_at: 'document_start' },
  ],
};
if (fs.existsSync(path.join(here, 'static/icon-128.png'))) {
  manifest.icons = { 16: 'icon-16.png', 48: 'icon-48.png', 128: 'icon-128.png' };
  manifest.action.default_icon = { 16: 'icon-16.png', 48: 'icon-48.png' };
}

const common = { bundle: true, target: 'chrome110', sourcemap: false, logLevel: 'info', legalComments: 'none' };
const jobs = [
  { entryPoints: [path.join(here, 'src/content/capture-entry.ts')], outfile: path.join(dist, 'capture.js'), format: 'iife' },
  { entryPoints: [path.join(here, 'src/content/bridge.ts')], outfile: path.join(dist, 'bridge.js'), format: 'iife' },
  { entryPoints: [path.join(here, 'src/popup/popup.ts')], outfile: path.join(dist, 'popup.js'), format: 'iife' },
  { entryPoints: [path.join(here, 'src/background.ts')], outfile: path.join(dist, 'background.js'), format: 'esm' },
];

function copyStatic() {
  fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const sdir = path.join(here, 'static');
  for (const f of fs.readdirSync(sdir)) fs.copyFileSync(path.join(sdir, f), path.join(dist, f));
}

if (watch) {
  copyStatic();
  const ctxs = await Promise.all(jobs.map((j) => context({ ...common, ...j })));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('watching…');
} else {
  await Promise.all(jobs.map((j) => build({ ...common, ...j })));
  copyStatic();
  console.log(`built ${jobs.length} bundles -> ${dist}`);
}
