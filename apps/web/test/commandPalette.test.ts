import { describe, expect, it } from 'vitest';
import { scoreCommand } from '../src/components/layout/CommandPalette';

const cmd = (label: string, group = 'Go to', keywords?: string) => ({ label, group, keywords });

describe('command palette search', () => {
  it('matches every word anywhere, and ranks label prefixes first', () => {
    expect(scoreCommand(cmd('Keys'), 'key')).toBeGreaterThan(scoreCommand(cmd('Export', 'Actions', 'keys backup'), 'key'));
    expect(scoreCommand(cmd('Last 30 days', 'Date range'), 'range 30')).toBeGreaterThan(0);
    expect(scoreCommand(cmd('Nord', 'Theme', 'colours'), 'theme nord')).toBeGreaterThan(0);
  });
  it('drops commands missing a word, and keeps everything for an empty query', () => {
    expect(scoreCommand(cmd('Keys'), 'keys zzz')).toBe(0);
    expect(scoreCommand(cmd('Keys'), '   ')).toBe(1);
  });
});
