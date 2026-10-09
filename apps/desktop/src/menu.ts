/** The application menu. Accelerators are real shortcuts that work even when the menu bar is hidden. */
import { Menu, type MenuItemConstructorOptions } from 'electron';
import { NAV_PATHS, type MenuAction } from '@typelens/host-contract';

const PAGE_LABELS = ['Overview', 'Keys', 'N-grams', 'Words', 'Fingers', 'Replay', 'Progress', 'Practice', 'Data'];

export interface MenuActions {
  isDev: boolean;
  navigate(path: string): void;
  action(a: MenuAction): void;
  openDataFolder(): void;
  openExtensionFolder(): void;
  openLogs(): void;
  openExternal(url: string): void;
  checkForUpdates(): void;
  about(): void;
  repoUrl: string;
}

export function buildMenu(a: MenuActions): Menu {
  const mac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: 'TypeLens',
            submenu: [
              { label: 'About TypeLens', click: a.about },
              { label: 'Check for updates...', click: a.checkForUpdates },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: '&File',
      submenu: [
        { label: 'Import...', accelerator: 'CmdOrCtrl+I', click: () => a.action('import') },
        { label: 'Export JSON...', accelerator: 'CmdOrCtrl+E', click: () => a.action('export-json') },
        { type: 'separator' },
        { label: 'Open data folder', click: a.openDataFolder },
        { label: 'Open browser-extension folder', click: a.openExtensionFolder },
        ...(mac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: '&View',
      submenu: [
        ...NAV_PATHS.map((p, i): MenuItemConstructorOptions => ({ label: PAGE_LABELS[i] ?? p, accelerator: `CmdOrCtrl+${i + 1}`, click: () => a.navigate(p) })),
        { type: 'separator' },
        // reloading a packaged app only ever helps developers; users have no use for it
        ...(a.isDev ? [{ role: 'reload' as const, accelerator: 'CmdOrCtrl+R' }, { role: 'toggleDevTools' as const }, { type: 'separator' as const }] : []),
        { role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' },
        { role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { type: 'separator' },
        { role: 'togglefullscreen', accelerator: mac ? 'Ctrl+Cmd+F' : 'F11' },
      ],
    },
    { role: 'windowMenu' },
    {
      label: '&Help',
      submenu: [
        { label: 'Project website', click: () => a.openExternal(a.repoUrl) },
        { label: 'Report a problem', click: () => a.openExternal(`${a.repoUrl}/issues/new/choose`) },
        { label: 'Open log folder', click: a.openLogs },
        ...(mac ? [] : [{ type: 'separator' as const }, { label: 'Check for updates...', click: a.checkForUpdates }, { label: 'About TypeLens', click: a.about }]),
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}
