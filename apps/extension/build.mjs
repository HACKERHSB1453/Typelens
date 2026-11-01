// Builds the extension with esbuild, once per browser family:
//   dist/           Chrome, Edge, Brave, Opera, Vivaldi (Chromium, MV3 service worker)
//   dist-firefox/   Firefox 128+ (MV3 event page, gecko id)
// Both contain the full dashboard (apps/web built with relative paths) under dashboard/.
//
//   node build.mjs                 both browsers, with the dashboard
//   node build.mjs --no-dashboard  skip the Vite build (faster; the popup's "Open dashboard" then 404s)
//   node build.mjs --watch         Chromium only, rebuild the scripts on change
import { build, context } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../web');
const watch = process.argv.includes('--watch');
const withDashboard = !watch && !process.argv.includes('--no-dashboard');
const tmp = path.join(here, '.build-tmp');

// The manifest reads its network constants from the same source files the runtime uses, so it can never
// disagree with the runtime checks: bridge-origins.ts (web-app origins) and the desktop contract.
async function loadConstants(entry) {
  fs.mkdirSync(tmp, { recursive: true });
  const out = path.join(tmp, `${path.basename(entry)}.mjs`);
  await build({ entryPoints: [entry], outfile: out, format: 'esm', bundle: true, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href + `?t=${Date.now()}`);
  fs.rmSync(out);
  return mod;
}

const { BRIDGE_ORIGINS, MONKEYTYPE_ORIGIN } = await loadConstants(path.join(here, 'src/bridge-origins.ts'));
const { DESKTOP_ORIGIN } = await loadConstants(path.join(here, '../../packages/core/src/desktop.ts'));
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));

/** Firefox add-on id. Keep it stable forever: Firefox ties the user's data and updates to it. */
const GECKO_ID = 'typelens@hackerhsb1453.github.io';

function manifestFor(browser) {
  const m = {
    manifest_version: 3,
    name: 'TypeLens',
    version: pkg.version,
    description: 'Typing analytics for Monkeytype. Records your tests and keeps them on this computer. Never the internet.',
    homepage_url: 'https://github.com/HACKERHSB1453/Typelens',
    // scripting: attach the recorder to Monkeytype tabs already open at install time (host access is monkeytype.com only)
    // alarms: wake the background worker every minute to retry the desktop app
    permissions: ['storage', 'unlimitedStorage', 'scripting', 'alarms'],
    // the desktop app on this computer, plus monkeytype.com (needed to find and inject into already-open tabs)
    host_permissions: [`${DESKTOP_ORIGIN}/*`, `${MONKEYTYPE_ORIGIN}/*`],
    action: { default_title: 'TypeLens', default_popup: 'popup.html' },
    content_scripts: [
      { matches: [`${MONKEYTYPE_ORIGIN}/*`], js: ['capture.js'], run_at: 'document_idle' },
      { matches: BRIDGE_ORIGINS.map((o) => `${o}/*`), js: ['bridge.js'], run_at: 'document_start' },
    ],
    // the bundled dashboard loads only its own files and talks to nothing on the network
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  };
  if (browser === 'chrome') {
    m.minimum_chrome_version = '110';
    m.background = { service_worker: 'background.js', type: 'module' };
  } else {
    // Firefox runs MV3 backgrounds as event pages (no service workers for extensions)
    m.background = { scripts: ['background.js'] };
    m.browser_specific_settings = {
      gecko: {
        id: GECKO_ID,
        strict_min_version: '128.0',
        // addons.mozilla.org asks every add-on to declare what it collects: nothing
        data_collection_permissions: { required: ['none'] },
      },
    };
  }
  if (fs.existsSync(path.join(here, 'static/icon-128.png'))) {
    m.icons = { 16: 'icon-16.png', 48: 'icon-48.png', 128: 'icon-128.png' };
    m.action.default_icon = { 16: 'icon-16.png', 48: 'icon-48.png' };
  }
  return m;
}

const targets = watch
  ? [{ browser: 'chrome', dir: path.join(here, 'dist'), esTarget: 'chrome110' }]
  : [
      { browser: 'chrome', dir: path.join(here, 'dist'), esTarget: 'chrome110' },
      { browser: 'firefox', dir: path.join(here, 'dist-firefox'), esTarget: 'firefox128' },
    ];

const jobsFor = (t) => {
  const common = { bundle: true, target: t.esTarget, sourcemap: false, logLevel: 'warning', legalComments: 'none' };
  return [
    { ...common, entryPoints: [path.join(here, 'src/content/capture-entry.ts')], outfile: path.join(t.dir, 'capture.js'), format: 'iife' },
    { ...common, entryPoints: [path.join(here, 'src/content/bridge.ts')], outfile: path.join(t.dir, 'bridge.js'), format: 'iife' },
    { ...common, entryPoints: [path.join(here, 'src/popup/popup.ts')], outfile: path.join(t.dir, 'popup.js'), format: 'iife' },
    { ...common, entryPoints: [path.join(here, 'src/background.ts')], outfile: path.join(t.dir, 'background.js'), format: 'esm' },
    { ...common, entryPoints: [path.join(here, 'src/dashboard/entry.ts')], outfile: path.join(t.dir, 'dashboard-host.js'), format: 'iife' },
  ];
};

function copyStatic(t) {
  fs.writeFileSync(path.join(t.dir, 'manifest.json'), JSON.stringify(manifestFor(t.browser), null, 2));
  const sdir = path.join(here, 'static');
  for (const f of fs.readdirSync(sdir)) fs.copyFileSync(path.join(sdir, f), path.join(t.dir, f));
}

/** Builds apps/web with relative asset paths and adds the host script in front of the dashboard bundle. */
function buildDashboard() {
  const out = path.join(tmp, 'dashboard');
  fs.rmSync(out, { recursive: true, force: true });
  const r = spawnSync('npx', ['vite', 'build', '--base', './', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: webDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) throw new Error('apps/web build for the extension dashboard failed');
  const indexPath = path.join(out, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  // a classic script runs before the deferred module bundle, so window.typelensHost is ready when the app starts
  const tag = '<script src="../dashboard-host.js"></script>';
  if (!html.includes('</title>')) throw new Error('unexpected dashboard index.html');
  fs.writeFileSync(indexPath, html.replace('</title>', `</title>\n    ${tag}`));
  return out;
}

for (const t of targets) {
  fs.rmSync(t.dir, { recursive: true, force: true });
  fs.mkdirSync(t.dir, { recursive: true });
}

if (watch) {
  const t = targets[0];
  copyStatic(t);
  const ctxs = await Promise.all(jobsFor(t).map((j) => context(j)));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('watching…');
} else {
  const dashboard = withDashboard ? buildDashboard() : null;
  for (const t of targets) {
    await Promise.all(jobsFor(t).map((j) => build(j)));
    copyStatic(t);
    if (dashboard) fs.cpSync(dashboard, path.join(t.dir, 'dashboard'), { recursive: true });
    console.log(`built the ${t.browser} extension -> ${path.relative(process.cwd(), t.dir) || '.'}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
