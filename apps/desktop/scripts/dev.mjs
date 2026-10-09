// `npm run dev -w @typelens/desktop`: Vite dev server for the dashboard + Electron pointed at it (hot reload in the window).
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const url = 'http://localhost:5173';
const require = createRequire(import.meta.url);
const electron = require('electron'); // path of the electron binary

const vite = spawn('npm', ['run', 'dev', '-w', '@typelens/web'], { cwd: root, stdio: 'inherit', shell: true });

const waitForPort = (port, tries = 100) =>
  new Promise((resolve, reject) => {
    const attempt = (left) => {
      const s = net.connect(port, 'localhost');
      s.once('connect', () => (s.destroy(), resolve()));
      s.once('error', () => (s.destroy(), left <= 0 ? reject(new Error('Vite dev server did not start')) : setTimeout(() => attempt(left - 1), 200)));
    };
    attempt(tries);
  });

let app;
const stop = () => {
  app?.kill();
  // shell:true on Windows wraps npm in cmd.exe; kill the whole tree
  if (process.platform === 'win32' && vite.pid) spawn('taskkill', ['/pid', String(vite.pid), '/t', '/f'], { stdio: 'ignore' });
  else vite.kill();
};
process.on('SIGINT', () => (stop(), process.exit(0)));

try {
  await waitForPort(5173);
  app = spawn(electron, [path.join(here, '../app')], { stdio: 'inherit', env: { ...process.env, TYPELENS_RENDERER_URL: url } });
  app.on('exit', () => (stop(), process.exit(0)));
} catch (err) {
  console.error(String(err));
  stop();
  process.exit(1);
}
