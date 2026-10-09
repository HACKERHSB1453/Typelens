/** Start-at-login: Windows/macOS through Electron's login items, Linux through an XDG autostart entry. */
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** the app starts minimised to the taskbar when launched this way, so logging in does not throw a window at you */
export const HIDDEN_ARG = '--hidden';

const autostartFile = (): string => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'typelens.desktop');

/**
 * One Exec= argument per the Desktop Entry spec: double quotes, with " ` $ \ backslash-escaped, then every
 * backslash doubled again (the file format's own string escaping), and % written %% (field codes).
 */
export function execQuote(arg: string): string {
  const escaped = arg
    .replace(/(["`$\\])/g, '\\$1')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '%%');
  return `"${escaped}"`;
}

export function autostartEntry(exec: string): string {
  const quoted = execQuote(exec);
  return `[Desktop Entry]\nType=Application\nName=TypeLens\nComment=Local-first typing analytics for Monkeytype\nExec=${quoted} ${HIDDEN_ARG}\nIcon=typelens\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
}

export function getStartAtLogin(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === 'linux') return fs.existsSync(autostartFile());
  return app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin;
}

export function setStartAtLogin(on: boolean): void {
  // an unpackaged run would register the bare electron binary, which is never what anyone wants
  if (!app.isPackaged) throw new Error('Start at login is only available in the installed app.');
  if (process.platform === 'linux') {
    const file = autostartFile();
    if (on) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, autostartEntry(process.env.APPIMAGE || process.execPath));
    } else fs.rmSync(file, { force: true });
    return;
  }
  app.setLoginItemSettings({ openAtLogin: on, args: [HIDDEN_ARG] });
}
