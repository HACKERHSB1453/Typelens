// Builds the desktop app into app/ (what electron-builder packages and `electron app` runs):
//   app/main.cjs      main process (esbuild bundle; electron-updater is bundled in, so nothing is installed at pack time)
//   app/preload.cjs   sandboxed preload
//   app/renderer/     the built dashboard (apps/web/dist)
//   app/icon.png      window icon (from build/icon.png)
//   app/package.json  generated: name, version, main
//
//   node build.mjs          full build (builds apps/web too)
//   node build.mjs --dev    main + preload only; the dashboard comes from the Vite dev server (TYPELENS_RENDERER_URL)
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(here, 'app');
const dev = process.argv.includes('--dev');
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));

// the GitHub owner/repo live ONLY in electron-builder.yml (publish:); the in-app links are derived from it
const yml = fs.readFileSync(path.join(here, 'electron-builder.yml'), 'utf8');
const owner = /^\s*owner:\s*(\S+)/m.exec(yml)?.[1];
const repo = /^\s*repo:\s*(\S+)/m.exec(yml)?.[1];
if (!owner || !repo) throw new Error('electron-builder.yml: publish.owner / publish.repo not found');
const repoUrl = `https://github.com/${owner}/${repo}`;
if (owner === 'OWNER_PLACEHOLDER') console.warn('warning: publish.owner in electron-builder.yml is still OWNER_PLACEHOLDER (auto-update and in-app links stay disabled/broken until you set it)');

// keep the renderer in dev mode so a previous full build is not thrown away
for (const f of fs.existsSync(out) ? fs.readdirSync(out) : []) {
  if (dev && f === 'renderer') continue;
  fs.rmSync(path.join(out, f), { recursive: true, force: true });
}
fs.mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: dev ? 'inline' : false,
  minify: false, // readable stack traces in main.log matter more than a few hundred KB
  logLevel: 'warning',
  define: { __REPO_URL__: JSON.stringify(repoUrl) },
};
await build({ ...common, entryPoints: [path.join(here, 'src/main.ts')], outfile: path.join(out, 'main.cjs') });
await build({ ...common, entryPoints: [path.join(here, 'src/preload.ts')], outfile: path.join(out, 'preload.cjs') });

if (!dev) {
  const web = path.join(root, 'apps/web');
  const r = spawnSync('npm', ['run', 'build'], { cwd: web, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error('apps/web build failed');
  fs.cpSync(path.join(web, 'dist'), path.join(out, 'renderer'), { recursive: true });
}

const icon = path.join(here, 'build/icon.png');
if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(out, 'icon.png'));
else console.warn('warning: apps/desktop/build/icon.png is missing; the default Electron icon will be used');

if (!fs.existsSync(path.join(root, 'apps/extension/dist/manifest.json'))) {
  console.warn('warning: apps/extension/dist is not built; the package will not contain the browser extension (run: npm run build -w @typelens/extension)');
}

fs.writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify(
    {
      name: 'typelens',
      productName: pkg.productName,
      desktopName: pkg.desktopName,
      version: pkg.version,
      description: pkg.description,
      author: pkg.author,
      homepage: repoUrl,
      license: pkg.license,
      main: 'main.cjs',
    },
    null,
    2,
  ),
);
console.log(`desktop app built into ${path.relative(process.cwd(), out) || '.'}${dev ? ' (dev)' : ''}`);
