// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeMonkeytypeTheme } from '@typelens/core/desktop';
import { mixHex, presetById, THEME_PRESETS, themeTokens, applyPalette, luminance } from '../src/lib/themes';
import { activeTheme, DEFAULT_THEME_SETTINGS, sanitizeThemeSettings } from '../src/lib/themeStore';

const SERIKA = { name: 'serika_dark', bg: '#323437', main: '#e2b714', sub: '#646669', subAlt: '#2c2e31', text: '#d1d0c5', error: '#ca4754' };

describe('built-in themes', () => {
  it('the TypeLens theme produces exactly the tokens in src/index.css (the default look does not change)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../src/index.css'), 'utf8');
    const p = presetById('typelens');
    const tokens = themeTokens(p.palette, p.overrides);
    for (const [token, hex] of Object.entries(tokens)) {
      const m = css.match(new RegExp(`--${token}:\\s*(#[0-9a-f]{6})`, 'i'));
      expect(m?.[1]?.toLowerCase(), token).toBe(hex);
    }
  });

  it('every preset is six valid colours with readable text', () => {
    expect(THEME_PRESETS.map((p) => p.id)).toEqual([
      'typelens',
      'serika-dark',
      'github-dark',
      'github-light',
      'catppuccin-mocha',
      'catppuccin-latte',
      'nord',
      'dracula',
      'gruvbox',
      'tokyo-night',
    ]);
    for (const p of THEME_PRESETS) {
      for (const v of Object.values(p.palette)) expect(v, p.id).toMatch(/^#[0-9a-f]{6}$/);
      expect(Math.abs(luminance(p.palette.text) - luminance(p.palette.bg)), p.id).toBeGreaterThan(0.5);
    }
  });

  it('mixHex blends two colours', () => {
    expect(mixHex('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#ff0000');
  });

  it('applyPalette writes hex and rgb tokens and the colour scheme', () => {
    applyPalette(presetById('github-light').palette);
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--bg')).toBe('#ffffff');
    expect(s.getPropertyValue('--bg-rgb')).toBe('255 255 255');
    expect(s.getPropertyValue('--main')).toBe('#0969da');
    expect(s.getPropertyValue('color-scheme')).toBe('light');
  });
});

describe('theme settings', () => {
  it('falls back field by field on stored junk', () => {
    expect(sanitizeThemeSettings(null)).toEqual(DEFAULT_THEME_SETTINGS);
    const s = sanitizeThemeSettings({ mode: 'weird', preset: 'nope', custom: { bg: '#123456', main: 'red' }, monkeytype: { bg: 1 } });
    expect(s.mode).toBe('preset');
    expect(s.preset).toBe('typelens');
    expect(s.custom.bg).toBe('#123456');
    expect(s.custom.main).toBe(DEFAULT_THEME_SETTINGS.custom.main);
    expect(s.monkeytype).toBeNull();
  });

  it('shows the preset, the custom colours or the Monkeytype theme depending on the mode', () => {
    const mt = sanitizeMonkeytypeTheme(SERIKA)!;
    const base = sanitizeThemeSettings({ preset: 'nord', monkeytype: mt, custom: { ...SERIKA, bg: '#101010' } });
    expect(activeTheme(base).palette).toEqual(presetById('nord').palette);
    expect(activeTheme({ ...base, mode: 'custom' }).palette.bg).toBe('#101010');
    expect(activeTheme({ ...base, mode: 'monkeytype' }).palette).toMatchObject({ bg: '#323437', main: '#e2b714', subAlt: '#2c2e31' });
    // monkeytype mode before the extension has reported a theme: the chosen preset
    expect(activeTheme({ ...base, mode: 'monkeytype', monkeytype: null }).palette).toEqual(presetById('nord').palette);
  });
});
