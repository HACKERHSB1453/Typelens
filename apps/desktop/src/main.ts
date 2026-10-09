/**
 * TypeLens desktop: an Electron shell around the dashboard (apps/web) plus the local sync endpoint the
 * browser extension pushes recorded tests to (server.ts). All data stays in the user's profile folder.
 *
 * The shell owns storage, windows, menus, updates and packaging; the dashboard only sees the typed
 * TypeLensHost that preload.ts builds on top of the IPC handlers registered here.
 */
import { BrowserWindow, Menu, Notification, app, dialog, ipcMain, protocol, screen, session, shell } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DESKTOP_HOST, DESKTOP_PORT } from '@typelens/core/desktop';
import type { Session } from '@typelens/core/schema';
import type { AppInfo, ExtensionStatus, MenuAction, UpdateState } from '@typelens/host-contract';
import { APP_SCHEME, APP_URL, createAppHandler } from './appProtocol';
import { CHANNELS as C } from './channels';
import { createIngester } from './ingest';
import { createInbox } from './inbox';
import {
  IpcArgError,
  asBool,
  asExportContent,
  asFileFilters,
  asFileName,
  asHttpsUrl,
  asId,
  asIds,
  asPrefKey,
  asPrefValue,
  asSessionList,
  isTrustedSender,
} from './ipc';
import { HIDDEN_ARG, getStartAtLogin, setStartAtLogin } from './loginItem';
import { buildMenu } from './menu';
import { createPrefs } from './prefs';
import { createSyncServer } from './server';
import { createSessionStore } from './sessionStore';
import { createSettings } from './settings';
import { createUpdater } from './updater';
import { clampBounds } from './windowState';

/** typelens://open: lets the extension popup bring the app to the front (handled by the single-instance lock) */
const LINK_SCHEME = 'typelens';
declare const __REPO_URL__: string; // injected by build.mjs from electron-builder.yml (the one place the GitHub owner/repo live)
const REPO_URL = __REPO_URL__;
const APP_ID = 'io.github.typelens.desktop';
const MAX_IMPORT_BYTES = 256 * 1024 * 1024;

// tests and scripted runs use a throwaway profile; the variable is never set in normal use
if (process.env.TYPELENS_USER_DATA) app.setPath('userData', path.resolve(process.env.TYPELENS_USER_DATA));

const isDev = !app.isPackaged;
/** the Vite dev server, honoured only in an unpackaged run */
const devUrl = isDev ? process.env.TYPELENS_RENDERER_URL : undefined;
const rendererRoot = path.join(__dirname, 'renderer');
const extensionDir = app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.resolve(__dirname, '../../extension/dist');
const trustedOrigins = ['app://typelens', ...(devUrl ? [new URL(devUrl).protocol + '//' + new URL(devUrl).host] : [])];

// ---------------------------------------------------------------- logging (a file the user can attach to bug reports)

const logDir = path.join(app.getPath('userData'), 'logs');
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'main.log');
try {
  if (fs.statSync(logFile).size > 1_000_000) fs.renameSync(logFile, `${logFile}.old`);
} catch {
  /* no log yet */
}
function log(...parts: unknown[]): void {
  const line = `${new Date().toISOString()} ${parts.map((p) => (p instanceof Error ? (p.stack ?? p.message) : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  fs.appendFile(logFile, line, () => undefined);
  if (isDev) process.stdout.write(line);
}
process.on('uncaughtException', (err) => log('uncaughtException', err));
process.on('unhandledRejection', (err) => log('unhandledRejection', err));

// ---------------------------------------------------------------- single instance

if (process.platform === 'win32') app.setAppUserModelId(APP_ID); // notifications and the taskbar group need it

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function start(): void {
  // must happen before the app is ready
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }]);
  // not in dev: that would point typelens:// at the bare electron binary instead of the installed app
  if (!isDev) app.setAsDefaultProtocolClient(LINK_SCHEME);

  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'data');
  const settings = createSettings(path.join(userData, 'settings.json'));
  const inbox = createInbox(path.join(userData, 'inbox'), (msg, err) => log('inbox:', msg, err));
  const store = createSessionStore(path.join(dataDir, 'sessions'), (msg, err) => log('session store:', msg, err));
  const prefs = createPrefs(path.join(dataDir, 'prefs.json'));
  const ingester = createIngester(inbox, store, log);
  const updater = createUpdater({
    isPackaged: app.isPackaged,
    platform: process.platform,
    resourcesPath: process.resourcesPath,
    appImage: process.env.APPIMAGE,
    log,
    load: () => (require('electron-updater') as typeof import('electron-updater')).autoUpdater as never,
  });

  let win: BrowserWindow | null = null;
  let serverError: string | null = null;
  let listening = false;
  const startHidden = process.argv.includes(HIDDEN_ARG);

  const send = (channel: string, ...args: unknown[]): void => {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, ...args);
  };

  // ---------------------------------------------------------------- extension -> inbox -> store

  function notifyNewTests(added: Session[]): void {
    if (!settings.get().notifyOnNewTest || !Notification.isSupported() || added.length === 0) return;
    if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) return; // they are looking at it
    const last = added[added.length - 1]!;
    const body =
      added.length > 1
        ? `${added.length} new tests recorded`
        : last.result
          ? `New test recorded — ${Math.round(last.result.wpm)} wpm, ${Math.round(last.result.acc)}% acc`
          : 'New test recorded';
    const n = new Notification({ title: 'TypeLens', body, silent: true });
    n.on('click', focusWindow);
    n.show();
  }

  async function ingest(): Promise<void> {
    try {
      const added = await ingester.drain();
      if (added.length) {
        log(`stored ${added.length} new session(s)`);
        send(C.evtSessions, { added: added.length });
        notifyNewTests(added);
      }
    } catch (err) {
      log('ingest failed', err);
    }
  }

  const sync = createSyncServer({
    port: DESKTOP_PORT,
    appVersion: app.getVersion(),
    inbox,
    pairing: {
      get: () => settings.get().pairedExtensionId,
      set: (id) => settings.update({ pairedExtensionId: id }),
    },
    onSessions: (ids) => {
      log(`received ${ids.length} session(s)`);
      void ingest();
    },
    onExtension: () => send(C.evtExtension),
  });

  function extensionStatus(): ExtensionStatus {
    const ext = sync.extension();
    const pairedId = settings.get().pairedExtensionId;
    return {
      transport: 'push',
      connected: listening && pairedId !== null && ext.lastSeenAt !== null,
      endpoint: { host: DESKTOP_HOST, port: DESKTOP_PORT, listening, error: serverError },
      paired: pairedId
        ? { id: pairedId, version: ext.version, lastSeenAt: ext.lastSeenAt, recorderSeenAt: ext.recorderSeenAt, health: ext.health }
        : null,
      extensionFolder: fs.existsSync(extensionDir) ? extensionDir : null,
      pending: 0,
    };
  }

  // ---------------------------------------------------------------- IPC

  function handle(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
    ipcMain.handle(channel, async (e, ...args) => {
      // only our own top-level page may call; anything else (a stray frame, a navigated window) is refused
      if (e.senderFrame !== e.sender.mainFrame || !isTrustedSender(e.senderFrame?.url, trustedOrigins)) {
        log('refused IPC from', e.senderFrame?.url, channel);
        throw new Error('forbidden');
      }
      try {
        return await fn(e, ...args);
      } catch (err) {
        if (!(err instanceof IpcArgError)) log(`ipc ${channel} failed`, err);
        throw err;
      }
    });
  }

  handle(C.appInfo, (): AppInfo => ({ name: app.getName(), version: app.getVersion(), platform: process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux', dataDir: userData }));

  handle(C.sessionsList, () => store.list());
  handle(C.sessionsPutMany, async (_e, sessions) => {
    const r = await store.putMany(asSessionList(sessions));
    return { added: r.added.length, skipped: r.skipped };
  });
  handle(C.sessionsDelete, (_e, id) => store.delete(asId(id)));
  handle(C.sessionsClear, () => store.clear());
  handle(C.sessionsCount, () => store.count());

  handle(C.prefsGet, (_e, key) => prefs.get(asPrefKey(key)));
  handle(C.prefsSet, (_e, key, value) => prefs.set(asPrefKey(key), asPrefValue(value)));

  handle(C.extStatus, () => extensionStatus());
  // sessions are stored the moment they arrive, so the inbox is normally empty; these keep the contract complete
  handle(C.extListPending, async () => ({ fresh: await inbox.list(), known: [] }));
  handle(C.extPull, (_e, ids) => inbox.get(asIds(ids, 50)));
  handle(C.extAck, (_e, ids) => inbox.remove(asIds(ids)));
  handle(C.extResetPairing, () => {
    settings.update({ pairedExtensionId: null });
    log('pairing reset');
    send(C.evtExtension);
  });

  handle(C.filesOpen, async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const opts: Electron.OpenDialogOptions = {
      title: 'Import sessions',
      properties: ['openFile'],
      filters: [
        { name: 'TypeLens export or Monkeytype results', extensions: ['json', 'csv'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    const file = r.filePaths[0];
    if (r.canceled || !file) return null;
    const stat = await fsp.stat(file);
    if (stat.size > MAX_IMPORT_BYTES) throw new Error('That file is too large to import.');
    // editors on Windows save JSON/CSV with a byte-order mark, which JSON.parse and the CSV header check reject
    return { name: path.basename(file), text: (await fsp.readFile(file, 'utf8')).replace(/^﻿/, '') };
  });
  handle(C.filesSave, async (e, defaultName, content, filters) => {
    const name = asFileName(defaultName);
    const text = asExportContent(content);
    const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const opts: Electron.SaveDialogOptions = { title: 'Export', defaultPath: path.join(app.getPath('documents'), name), filters: asFileFilters(filters) };
    const r = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, text, 'utf8');
    return path.basename(r.filePath);
  });

  const openFolder = async (dir: string, what: string): Promise<void> => {
    if (!fs.existsSync(dir)) throw new Error(`The ${what} folder does not exist: ${dir}`);
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
  };
  handle(C.shellOpenExternal, (_e, url) => shell.openExternal(asHttpsUrl(url)));
  handle(C.shellOpenDataFolder, () => openFolder(dataDir, 'data'));
  handle(C.shellOpenExtensionFolder, () => openFolder(extensionDir, 'browser-extension'));
  handle(C.shellRevealLogs, () => openFolder(logDir, 'log'));

  handle(C.updatesState, () => updater.state());
  handle(C.updatesCheck, () => updater.check());
  handle(C.updatesInstall, () => updater.installAndRestart());
  updater.onChange((s) => send(C.evtUpdates, s));

  handle(C.settingsGet, (_e, key) => {
    if (key === 'startAtLogin') return getStartAtLogin();
    if (key === 'notifyOnNewTest') return settings.get().notifyOnNewTest;
    throw new IpcArgError('invalid argument: setting');
  });
  handle(C.settingsSet, (_e, key, value) => {
    const on = asBool(value);
    if (key === 'startAtLogin') {
      setStartAtLogin(on);
      settings.update({ startAtLogin: on });
    } else if (key === 'notifyOnNewTest') settings.update({ notifyOnNewTest: on });
    else throw new IpcArgError('invalid argument: setting');
  });

  // ---------------------------------------------------------------- window

  function createWindow(): void {
    const saved = settings.get().window;
    const bounds = clampBounds(
      { width: saved?.width ?? 1360, height: saved?.height ?? 880, ...(saved?.x !== undefined && saved?.y !== undefined ? { x: saved.x, y: saved.y } : {}) },
      screen.getAllDisplays().map((d) => d.workArea),
    );
    const icon = path.join(__dirname, 'icon.png');
    win = new BrowserWindow({
      ...bounds,
      minWidth: 820,
      minHeight: 560,
      show: false,
      backgroundColor: '#000000', // matches the dashboard: no white flash while it loads
      title: 'TypeLens',
      ...(fs.existsSync(icon) ? { icon } : {}),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        devTools: !app.isPackaged,
      },
    });
    const w = win;
    if (saved?.maximized) w.maximize();
    w.once('ready-to-show', () => {
      w.show();
      if (startHidden) w.minimize();
    });
    w.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);

    const saveBounds = (): void => {
      if (w.isDestroyed()) return;
      settings.update({ window: { ...w.getNormalBounds(), maximized: w.isMaximized() } });
    };
    w.on('close', saveBounds);
    w.on('closed', () => {
      win = null;
    });

    // never navigate the app window away from the dashboard; real links open in the user's browser
    w.webContents.on('will-navigate', (e, url) => {
      if (!isTrustedSender(url, trustedOrigins)) {
        e.preventDefault();
        if (/^https:\/\//.test(url)) void shell.openExternal(url);
      }
    });
    w.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    const reloads: number[] = [];
    w.webContents.on('render-process-gone', (_e, d) => {
      log('renderer gone', d);
      if (d.reason === 'clean-exit' || w.isDestroyed()) return;
      const now = Date.now();
      while (reloads.length && now - reloads[0]! > 60_000) reloads.shift();
      if (reloads.length < 3) {
        reloads.push(now);
        w.reload();
        return;
      }
      // crashing again and again: stop looping and tell the user where to look
      void dialog
        .showMessageBox(w, {
          type: 'error',
          title: 'TypeLens',
          message: 'The TypeLens window keeps crashing.',
          detail: `Reason: ${d.reason}. The log folder has details you can attach to a bug report.`,
          buttons: ['Open log folder', 'Quit'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((r) => {
          if (r.response === 0) void openFolder(logDir, 'log').catch(() => undefined);
          else app.quit();
        });
    });
    w.webContents.on('did-fail-load', (_e, code, desc, url) => log('load failed', code, desc, url));
    // right-click in text fields: the native cut/copy/paste menu a desktop app is expected to have
    w.webContents.on('context-menu', (_e, p) => {
      if (!p.isEditable && !p.selectionText) return;
      Menu.buildFromTemplate([
        ...(p.isEditable ? [{ role: 'cut' as const }] : []),
        { role: 'copy' as const },
        ...(p.isEditable ? [{ role: 'paste' as const }] : []),
        { type: 'separator' as const },
        { role: 'selectAll' as const },
      ]).popup({ window: w });
    });

    void w.loadURL(devUrl ?? APP_URL);
  }

  function focusWindow(): void {
    if (!app.isReady()) return; // a second launch can arrive before startup finished; the first window is about to open anyway
    if (!win || win.isDestroyed()) {
      createWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  function navigate(p: string): void {
    focusWindow();
    send(C.evtNavigate, p);
  }
  function menuAction(a: MenuAction): void {
    focusWindow();
    send(C.evtMenu, a);
  }

  async function checkForUpdatesFromMenu(): Promise<void> {
    const s: UpdateState = await updater.check();
    const message =
      s.status === 'ready'
        ? `TypeLens ${s.version} is ready to install.`
        : s.status === 'downloading' || s.status === 'available'
          ? `TypeLens ${s.version} is downloading in the background.`
          : s.status === 'unsupported'
            ? s.reason
            : s.status === 'error'
              ? `The update check failed: ${s.message}`
              : s.status === 'checking'
                ? 'An update check is already running. Try again in a moment.'
                : `You have the latest version (${app.getVersion()}).`;
    const parent = win && !win.isDestroyed() ? win : undefined;
    const opts: Electron.MessageBoxOptions = { type: 'info', title: 'Updates', message, buttons: s.status === 'ready' ? ['Restart now', 'Later'] : ['OK'], defaultId: 0, cancelId: s.status === 'ready' ? 1 : 0 };
    const r = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts);
    if (s.status === 'ready' && r.response === 0) updater.installAndRestart();
  }

  function about(): void {
    const opts: Electron.MessageBoxOptions = {
      type: 'info',
      title: 'About TypeLens',
      message: `TypeLens ${app.getVersion()}`,
      detail: `Local-first typing analytics for Monkeytype.\nYour data stays on this computer.\n\nElectron ${process.versions.electron}, Chromium ${process.versions.chrome}, Node ${process.versions.node}\n${REPO_URL}\n\nNot affiliated with Monkeytype.`,
      buttons: ['OK'],
    };
    void (win && !win.isDestroyed() ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts));
  }

  app.on('second-instance', () => focusWindow()); // includes typelens://open from the extension popup
  app.on('open-url', (e) => {
    e.preventDefault();
    focusWindow();
  });
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
  });
  app.on('child-process-gone', (_e, d) => log('child process gone', d));

  app.whenReady().then(
    async () => {
      log(`TypeLens ${app.getVersion()} starting (electron ${process.versions.electron}, ${process.platform}, packaged=${app.isPackaged})`);
      protocol.handle(APP_SCHEME, createAppHandler(rendererRoot));
      // the dashboard needs no camera, notifications API, geolocation... (native notifications come from the main process)
      // ...except copying text (the "Copy path" and practice-text buttons use navigator.clipboard) on our own page
      const allowed = (perm: string, origin: string | undefined): boolean => perm === 'clipboard-sanitized-write' && isTrustedSender(origin, trustedOrigins);
      session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allowed(perm, wc.getURL())));
      session.defaultSession.setPermissionCheckHandler((_wc, perm, origin) => allowed(perm, origin));
      Menu.setApplicationMenu(
        buildMenu({
          isDev,
          navigate,
          action: menuAction,
          openDataFolder: () => void openFolder(dataDir, 'data').catch((err) => log(err)),
          openExtensionFolder: () => void openFolder(extensionDir, 'browser-extension').catch((err) => dialog.showErrorBox('TypeLens', String(err.message))),
          openLogs: () => void openFolder(logDir, 'log').catch((err) => log(err)),
          openExternal: (url) => void shell.openExternal(url),
          checkForUpdates: () => void checkForUpdatesFromMenu(),
          about,
          repoUrl: REPO_URL,
        }),
      );
      createWindow();
      try {
        await sync.listen();
        listening = true;
        log(`sync endpoint listening on ${DESKTOP_HOST}:${DESKTOP_PORT}`);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        serverError =
          code === 'EADDRINUSE'
            ? `Port ${DESKTOP_PORT} is already in use by another program, so the extension cannot deliver tests. Close that program and restart TypeLens.`
            : `The sync endpoint could not start: ${err instanceof Error ? err.message : String(err)}`;
        log('sync listen failed', err);
      }
      send(C.evtExtension);
      await ingest(); // anything a previous run received but did not finish storing
      updater.start();
    },
    (err: unknown) => log('startup failed', err),
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', () => {
    updater.stop();
    void sync.close();
  });
}
