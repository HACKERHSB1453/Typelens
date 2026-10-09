/** IPC channel names, shared by the main process (ipc.ts / main.ts) and the sandboxed preload. No imports: the preload bundles this. */
export const CHANNELS = {
  appInfo: 'typelens:app:info',

  sessionsList: 'typelens:sessions:list',
  sessionsPutMany: 'typelens:sessions:putMany',
  sessionsDelete: 'typelens:sessions:delete',
  sessionsClear: 'typelens:sessions:clear',
  sessionsCount: 'typelens:sessions:count',

  prefsGet: 'typelens:prefs:get',
  prefsSet: 'typelens:prefs:set',

  extStatus: 'typelens:ext:status',
  extListPending: 'typelens:ext:listPending',
  extPull: 'typelens:ext:pull',
  extAck: 'typelens:ext:ack',
  extResetPairing: 'typelens:ext:resetPairing',

  filesOpen: 'typelens:files:open',
  filesSave: 'typelens:files:save',

  shellOpenExternal: 'typelens:shell:openExternal',
  shellOpenDataFolder: 'typelens:shell:openDataFolder',
  shellOpenExtensionFolder: 'typelens:shell:openExtensionFolder',
  shellRevealLogs: 'typelens:shell:revealLogs',

  updatesState: 'typelens:updates:state',
  updatesCheck: 'typelens:updates:check',
  updatesInstall: 'typelens:updates:install',

  settingsGet: 'typelens:settings:get',
  settingsSet: 'typelens:settings:set',

  /** main -> renderer events */
  evtSessions: 'typelens:evt:sessions',
  evtExtension: 'typelens:evt:extension',
  evtUpdates: 'typelens:evt:updates',
  evtNavigate: 'typelens:evt:navigate',
  evtMenu: 'typelens:evt:menu',
} as const;
