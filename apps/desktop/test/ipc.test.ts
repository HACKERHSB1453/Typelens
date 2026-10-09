import { describe, expect, it } from 'vitest';
import { CHANNELS } from '../src/channels';
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
} from '../src/ipc';

describe('ipc argument validation', () => {
  it('ids: non-empty strings of sane length', () => {
    expect(asId('abc')).toBe('abc');
    for (const bad of ['', 5, null, undefined, {}, 'x'.repeat(201)]) expect(() => asId(bad)).toThrow(IpcArgError);
    expect(asIds(['a', 'b'])).toEqual(['a', 'b']);
    expect(() => asIds('a')).toThrow(IpcArgError);
    expect(() => asIds(['a', 1])).toThrow(IpcArgError);
    expect(() => asIds(['a', 'b', 'c'], 2)).toThrow(IpcArgError);
  });

  it('booleans must be booleans', () => {
    expect(asBool(true)).toBe(true);
    for (const bad of ['true', 1, null, undefined]) expect(() => asBool(bad)).toThrow(IpcArgError);
  });

  it('preference keys: short and path-free', () => {
    expect(asPrefKey('typelens.source')).toBe('typelens.source');
    for (const bad of ['', '../x', 'a b', 'x'.repeat(65), 'a/b', 3, '__proto__!']) expect(() => asPrefKey(bad)).toThrow(IpcArgError);
  });

  it('preference values: JSON only, size capped, null removes', () => {
    expect(asPrefValue({ a: [1, 2] })).toEqual({ a: [1, 2] });
    expect(asPrefValue(undefined)).toBeNull();
    expect(asPrefValue(null)).toBeNull();
    expect(() => asPrefValue('x'.repeat(1_000_001))).toThrow(IpcArgError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => asPrefValue(cyclic)).toThrow(IpcArgError);
    expect(() => asPrefValue(() => 1)).toThrow(IpcArgError);
  });

  it('session lists: arrays of bounded size', () => {
    expect(asSessionList([])).toEqual([]);
    expect(() => asSessionList({})).toThrow(IpcArgError);
    expect(() => asSessionList(new Array(5_001).fill(0))).toThrow(IpcArgError);
  });

  it('openExternal accepts https only', () => {
    expect(asHttpsUrl('https://github.com/HACKERHSB1453/Typelens')).toMatch(/^https:\/\/github\.com\//);
    for (const bad of ['http://example.com', 'file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'ms-msdt:/id', 'https://user:pw@example.com', 'not a url', '', 5]) {
      expect(() => asHttpsUrl(bad)).toThrow(IpcArgError);
    }
  });

  it('save-dialog file names lose directories and illegal characters', () => {
    expect(asFileName('typelens-sessions.json')).toBe('typelens-sessions.json');
    expect(asFileName('..\\..\\Windows\\evil.json')).toBe('evil.json');
    expect(asFileName('/etc/passwd')).toBe('passwd');
    expect(asFileName('a:b*c?.json')).toBe('a_b_c_.json');
    expect(asFileName('..')).toBe('typelens-export');
    expect(asFileName('')).toBe('typelens-export');
    expect(() => asFileName(42)).toThrow(IpcArgError);
  });

  it('file filters: plain extensions only', () => {
    expect(asFileFilters(undefined)).toEqual([]);
    expect(asFileFilters([{ name: 'JSON', extensions: ['json'] }])).toEqual([{ name: 'JSON', extensions: ['json'] }]);
    expect(() => asFileFilters([{ name: 'x', extensions: ['*'] }])).toThrow(IpcArgError);
    expect(() => asFileFilters([{ name: 'x', extensions: ['../x'] }])).toThrow(IpcArgError);
    expect(() => asFileFilters('json')).toThrow(IpcArgError);
    expect(() => asFileFilters([null])).toThrow(IpcArgError);
  });

  it('export content must be a string', () => {
    expect(asExportContent('{}')).toBe('{}');
    expect(() => asExportContent({})).toThrow(IpcArgError);
  });

  it('only our own pages may call: app://typelens (and the dev server when configured)', () => {
    const trusted = ['app://typelens'];
    expect(isTrustedSender('app://typelens/data', trusted)).toBe(true);
    expect(isTrustedSender('app://typelens/', trusted)).toBe(true);
    for (const bad of ['app://evil/', 'https://typelens/', 'file:///C:/x.html', 'about:blank', 'data:text/html,hi', 'http://localhost:5173/', 'app://typelens.evil.com/', '', undefined, 'garbage']) {
      expect(isTrustedSender(bad, trusted)).toBe(false);
    }
    expect(isTrustedSender('http://localhost:5173/data', [...trusted, 'http://localhost:5173'])).toBe(true);
  });

  it('channel names are unique', () => {
    const names = Object.values(CHANNELS);
    expect(new Set(names).size).toBe(names.length);
  });
});
