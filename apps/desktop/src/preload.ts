/**
 * Sandboxed preload: builds the typed TypeLensHost out of IPC calls and exposes it as `window.typelensHost`.
 * The page gets exactly this object and nothing else (no ipcRenderer, no Node). Keep this file free of
 * imports other than types and ./channels: it is bundled into a sandbox where require() is limited.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MenuAction, TypeLensHost, UpdateState } from '@typelens/host-contract';
import { CHANNELS as C } from './channels';

const call = <T = void>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>;

function subscribe<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A));
  ipcRenderer.on(channel, listener);
  return () => void ipcRenderer.removeListener(channel, listener);
}

const host: TypeLensHost = {
  kind: 'desktop',
  capabilities: { nativeFiles: true, notifications: true, autoUpdate: true, extensionPush: true, openFolders: true, startAtLogin: true },
  app: { info: () => call(C.appInfo) },
  sessions: {
    list: () => call(C.sessionsList),
    putMany: (sessions) => call(C.sessionsPutMany, sessions),
    delete: (id) => call(C.sessionsDelete, id),
    clear: () => call(C.sessionsClear),
    count: () => call(C.sessionsCount),
    onChange: (cb) => subscribe(C.evtSessions, cb),
  },
  prefs: {
    get: <T,>(key: string) => call<T | null>(C.prefsGet, key),
    set: (key, value) => call(C.prefsSet, key, value),
  },
  extension: {
    status: () => call(C.extStatus),
    listPending: () => call(C.extListPending),
    pullPending: (ids) => call(C.extPull, ids),
    ack: (ids) => call(C.extAck, ids),
    resetPairing: () => call(C.extResetPairing),
    onChange: (cb) => subscribe(C.evtExtension, () => cb()),
  },
  files: {
    openImportFile: () => call(C.filesOpen),
    saveExport: (defaultName, content, filters) => call(C.filesSave, defaultName, content, filters),
  },
  shell: {
    openExternal: (url) => call(C.shellOpenExternal, url),
    openDataFolder: () => call(C.shellOpenDataFolder),
    openExtensionFolder: () => call(C.shellOpenExtensionFolder),
    revealLogs: () => call(C.shellRevealLogs),
  },
  updates: {
    state: () => call(C.updatesState),
    check: () => call(C.updatesCheck),
    installAndRestart: () => call(C.updatesInstall),
    onChange: (cb) => subscribe<[UpdateState]>(C.evtUpdates, cb),
  },
  settings: {
    getStartAtLogin: () => call(C.settingsGet, 'startAtLogin'),
    setStartAtLogin: (on) => call(C.settingsSet, 'startAtLogin', on),
    getNotifyOnNewTest: () => call(C.settingsGet, 'notifyOnNewTest'),
    setNotifyOnNewTest: (on) => call(C.settingsSet, 'notifyOnNewTest', on),
  },
  onNavigate: (cb) => subscribe<[string]>(C.evtNavigate, cb),
  onMenuAction: (cb) => subscribe<[MenuAction]>(C.evtMenu, cb),
};

contextBridge.exposeInMainWorld('typelensHost', host);
