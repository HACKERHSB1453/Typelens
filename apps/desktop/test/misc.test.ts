import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppHandler } from '../src/appProtocol';
import { createPrefs } from '../src/prefs';
import { createSettings, sanitize } from '../src/settings';
import { unsupportedReason } from '../src/updater';
import { clampBounds } from '../src/windowState';
import { tmpDir } from './helpers';

const dirs: string[] = [];
const fresh = (): string => {
  const d = tmpDir();
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('prefs', () => {
  it('persists values across instances and removes with null', async () => {
    const file = path.join(fresh(), 'prefs.json');
    const a = createPrefs(file);
    expect(await a.get('k')).toBeNull();
    await a.set('k', { x: 1 });
    await a.set('s', 'demo');
    expect(await createPrefs(file).get('k')).toEqual({ x: 1 });
    await a.set('k', null);
    expect(await createPrefs(file).get('k')).toBeNull();
    expect(await createPrefs(file).get('s')).toBe('demo');
  });
  it('recovers from a damaged file', async () => {
    const file = path.join(fresh(), 'prefs.json');
    fs.writeFileSync(file, '{ broken');
    const p = createPrefs(file);
    expect(await p.get('a')).toBeNull();
    await p.set('a', 1);
    expect(await createPrefs(file).get('a')).toBe(1);
  });
  it('does not expose prototype keys', async () => {
    expect(await createPrefs(path.join(fresh(), 'p.json')).get('constructor')).toBeNull();
  });
});

describe('settings', () => {
  it('has safe defaults and persists updates', () => {
    const file = path.join(fresh(), 'settings.json');
    const s = createSettings(file);
    expect(s.get()).toMatchObject({ pairedExtensionId: null, notifyOnNewTest: true, startAtLogin: false, window: null });
    s.update({ pairedExtensionId: 'abc', notifyOnNewTest: false });
    expect(createSettings(file).get()).toMatchObject({ pairedExtensionId: 'abc', notifyOnNewTest: false });
  });
  it('distrusts hand-edited garbage', () => {
    const s = sanitize({ window: { width: 'wide', height: 5 }, pairedExtensionId: '../../x', startAtLogin: 'yes', notifyOnNewTest: 0 });
    expect(s).toEqual({ window: null, pairedExtensionId: null, startAtLogin: false, notifyOnNewTest: true });
    expect(sanitize({ window: { width: 800, height: 600, x: 10, y: 20, maximized: true } }).window).toEqual({ width: 800, height: 600, x: 10, y: 20, maximized: true });
    expect(sanitize('nope').window).toBeNull();
  });
});

describe('window bounds', () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1040 };
  it('keeps bounds that are on a display', () => {
    expect(clampBounds({ x: 100, y: 80, width: 1200, height: 800 }, [screen])).toEqual({ x: 100, y: 80, width: 1200, height: 800 });
  });
  it('drops the position when the monitor it was on is gone', () => {
    expect(clampBounds({ x: 2500, y: 100, width: 1200, height: 800 }, [screen])).toEqual({ width: 1200, height: 800 });
  });
  it('caps an oversized window and pulls a half-off window back', () => {
    expect(clampBounds({ x: 1800, y: 0, width: 3000, height: 3000 }, [screen])).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
    expect(clampBounds({ x: 1500, y: 600, width: 800, height: 600 }, [screen])).toEqual({ x: 1120, y: 440, width: 800, height: 600 });
  });
  it('works on a second display', () => {
    const second = { x: 1920, y: 0, width: 1280, height: 1024 };
    expect(clampBounds({ x: 2000, y: 50, width: 900, height: 700 }, [screen, second])).toEqual({ x: 2000, y: 50, width: 900, height: 700 });
  });
});

describe('app:// handler', () => {
  function site() {
    const root = path.join(fresh(), 'renderer');
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'index.html'), '<html>app</html>');
    fs.writeFileSync(path.join(root, 'assets', 'a.js'), 'x');
    fs.writeFileSync(path.join(path.dirname(root), 'secret.txt'), 'secret');
    return createAppHandler(root);
  }
  const get = (h: ReturnType<typeof site>, p: string) => h(new Request(`app://typelens${p}`));

  it('serves files with a CSP and falls back to index.html for client routes', async () => {
    const h = site();
    const js = await get(h, '/assets/a.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(js.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(await (await get(h, '/replay/abc')).text()).toBe('<html>app</html>');
    expect((await get(h, '/assets/missing.js')).status).toBe(404);
  });
  it('cannot be walked out of the renderer folder', async () => {
    const h = site();
    for (const p of ['/..%2Fsecret.txt', '/%2e%2e/secret.txt', '/assets/..%2F..%2Fsecret.txt']) {
      const res = await get(h, p);
      expect(await res.text()).not.toBe('secret');
    }
  });
  it('ignores other hosts', async () => {
    const h = site();
    expect((await h(new Request('app://evil/'))).status).toBe(404);
  });
});

describe('updater support detection', () => {
  const base = { platform: 'win32' as NodeJS.Platform, resourcesPath: '/nonexistent' };
  it('is unsupported when not packaged', () => {
    expect(unsupportedReason({ ...base, isPackaged: false })).toMatch(/installed app/);
  });
  it('is unsupported without an update feed, or with the placeholder owner', () => {
    expect(unsupportedReason({ ...base, isPackaged: true })).toMatch(/update feed/);
    const dir = fresh();
    fs.writeFileSync(path.join(dir, 'app-update.yml'), 'provider: github\nowner: OWNER_PLACEHOLDER\nrepo: typelens\n');
    expect(unsupportedReason({ isPackaged: true, platform: 'win32', resourcesPath: dir })).toMatch(/not configured/);
    fs.writeFileSync(path.join(dir, 'app-update.yml'), 'provider: github\nowner: someone\nrepo: typelens\n');
    expect(unsupportedReason({ isPackaged: true, platform: 'win32', resourcesPath: dir })).toBeNull();
    expect(unsupportedReason({ isPackaged: true, platform: 'linux', resourcesPath: dir })).toBeNull();
  });
});

describe('update errors', () => {
  it('are short and readable', async () => {
    const { friendlyError } = await import('../src/updater');
    expect(friendlyError(new Error('404 \n<html>...'))).toBe('The update server answered with HTTP 404.');
    expect(friendlyError(new Error('net::ERR_INTERNET_DISCONNECTED'))).toMatch(/offline/);
    expect(friendlyError(new Error('boom\nstack'))).toBe('boom');
    expect(friendlyError('')).toBe('Update check failed.');
  });
});

describe('autostart entry', () => {
  it('quotes the Exec line per the desktop entry spec', async () => {
    vi.doMock('electron', () => ({ app: {} }));
    const { execQuote, autostartEntry } = await import('../src/loginItem');
    expect(execQuote('/opt/Type Lens/typelens')).toBe('"/opt/Type Lens/typelens"');
    expect(execQuote('/opt/100%/typelens')).toBe('"/opt/100%%/typelens"');
    const B = String.fromCharCode(92); // one backslash
    expect(execQuote('a"b$c`d')).toBe('"a' + B + B + '"b' + B + B + '$c' + B + B + '`d"');
    expect(execQuote('a' + B + 'b')).toBe('"a' + B + B + B + B + 'b"');
    expect(autostartEntry('/opt/TypeLens/typelens')).toContain('Exec="/opt/TypeLens/typelens" --hidden\n');
  });
});
