/**
 * Auto-update via electron-updater (GitHub releases; the repo is set in electron-builder.yml `publish`).
 *  - only in a packaged app that has an app-update.yml (so not `electron app`, not the .zip build);
 *  - downloads in the background but NEVER installs by itself: the UI shows "Update ready - restart" and the
 *    user decides (autoInstallOnAppQuit is off);
 *  - checks shortly after launch and then every 6 hours.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { UpdateState } from '@typelens/host-contract';

export interface UpdaterEnv {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
  /** AppImage path when running as an AppImage */
  appImage?: string | undefined;
  log: (...p: unknown[]) => void;
  /** lazily loads electron-updater; injected so tests (and unpackaged runs) never touch it */
  load: () => AutoUpdaterLike;
}

/** The slice of electron-updater's autoUpdater this module uses. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  logger: unknown;
  on(event: string, cb: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface Updater {
  state(): UpdateState;
  check(): Promise<UpdateState>;
  installAndRestart(): void;
  onChange(cb: (s: UpdateState) => void): () => void;
  /** starts the launch-time and periodic checks */
  start(): void;
  stop(): void;
}

const SIX_HOURS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY = 20_000;

/** Why updates cannot work here, or null when they can. */
export function unsupportedReason(env: Pick<UpdaterEnv, 'isPackaged' | 'platform' | 'resourcesPath' | 'appImage'>): string | null {
  if (!env.isPackaged) return 'Updates are only available in the installed app.';
  if (env.platform === 'darwin') return 'Automatic updates are not available on this platform yet.';
  let yml: string;
  try {
    yml = fs.readFileSync(path.join(env.resourcesPath, 'app-update.yml'), 'utf8');
  } catch {
    return 'This build was not made with an update feed (portable or zip build). Download new versions from the releases page.';
  }
  if (/OWNER_PLACEHOLDER/.test(yml)) return 'The update feed is not configured in this build.';
  // Linux: electron-updater handles deb and rpm; deb/rpm need the package manager and admin rights,
  // and when that fails it reports an error, which the UI shows rather than hiding.
  return null;
}

/** electron-updater's messages are multi-line and cryptic ("404 "); keep the first line and explain the common cases. */
export function friendlyError(err: unknown): string {
  const first = (err instanceof Error ? err.message : String(err)).split(/\r?\n/)[0]!.trim();
  const http = /^(\d{3})\b/.exec(first);
  if (http) return `The update server answered with HTTP ${http[1]}.`;
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/.test(first)) return 'Could not reach the update server. Are you offline?';
  return first.slice(0, 300) || 'Update check failed.';
}

export function createUpdater(env: UpdaterEnv): Updater {
  let state: UpdateState = { status: 'idle', checkedAt: null };
  const listeners = new Set<(s: UpdateState) => void>();
  let timers: NodeJS.Timeout[] = [];
  let driver: AutoUpdaterLike | null = null;

  const set = (s: UpdateState): void => {
    state = s;
    listeners.forEach((l) => l(s));
  };

  const reason = unsupportedReason(env);
  if (reason) state = { status: 'unsupported', reason };

  function ensureDriver(): AutoUpdaterLike {
    if (driver) return driver;
    const u = env.load();
    u.autoDownload = true;
    u.autoInstallOnAppQuit = false; // the user decides when to restart
    u.allowPrerelease = false;
    u.logger = { info: env.log, warn: env.log, error: env.log, debug: () => undefined };
    u.on('checking-for-update', () => set({ status: 'checking' }));
    u.on('update-available', (info: { version: string }) => set({ status: 'downloading', version: info.version, percent: 0 }));
    u.on('update-not-available', () => set({ status: 'idle', checkedAt: Date.now() }));
    u.on('download-progress', (p: { percent: number }) => {
      if (state.status === 'downloading') set({ ...state, percent: Math.round(p.percent) });
    });
    u.on('update-downloaded', (info: { version: string }) => set({ status: 'ready', version: info.version }));
    u.on('error', (err: Error) => set({ status: 'error', message: friendlyError(err) }));
    driver = u;
    return u;
  }

  async function check(): Promise<UpdateState> {
    if (state.status === 'unsupported' || state.status === 'ready') return state;
    if (state.status === 'checking' || state.status === 'downloading') return state;
    try {
      await ensureDriver().checkForUpdates();
    } catch (err) {
      // also reported through the 'error' event; set it here in case the event did not fire
      if (state.status !== 'error') set({ status: 'error', message: friendlyError(err) });
    }
    return state;
  }

  return {
    state: () => state,
    check,
    installAndRestart() {
      if (state.status !== 'ready') throw new Error('No update is ready to install.');
      ensureDriver().quitAndInstall(false, true);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    start() {
      if (state.status === 'unsupported') return;
      timers = [setTimeout(() => void check(), FIRST_CHECK_DELAY), setInterval(() => void check(), SIX_HOURS)];
      for (const t of timers) t.unref();
    },
    stop() {
      timers.forEach((t) => clearTimeout(t));
      timers = [];
    },
  };
}
