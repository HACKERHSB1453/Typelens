import { describe, expect, it } from 'vitest';
import { isMonkeytypeResultsCsv, isSameTest, parseCsv, parseMonkeytypeResultsCsv } from '../src/history';
import { analyze } from '../src/analyze';
import { buildProgress } from '../src/progress';
import { validateSession } from '../src/export';
import { makeSession } from '../src/fixtures';

// header + rows copied from a real Monkeytype export (2026-09-24)
const HEADER = '_id,isPb,wpm,acc,rawWpm,consistency,charStats,mode,mode2,quoteLength,restartCount,testDuration,afkDuration,incompleteTestSeconds,punctuation,numbers,language,funbox,difficulty,lazyMode,blindMode,bailedOut,tags,timestamp';
const CSV = [
  HEADER,
  '6ab561d69503ffe34a04d147,false,99,96.02,102.2,66.95,495;7;2;2,time,60,-1,5,60,1,28.13,false,false,english,,normal,false,false,false,,1790271958000',
  '6ab559939503ffe34a04546b,true,94.4,91.79,103.4,67.31,472;15;8;0,time,60,-1,3,60,0,13.45,false,false,english,,normal,false,false,false,,1790269843000',
  '6ab5579a9503ffe34a043619,false,111.52,94.34,111.52,69.67,50;0;0;0,words,10,-1,1,5.38,0,2.25,false,false,english,layoutfluid#mirror,expert,false,false,true,,1790269338000',
].join('\r\n');

describe('Monkeytype results export', () => {
  it('is recognised by its header', () => {
    expect(isMonkeytypeResultsCsv(CSV)).toBe(true);
    expect(isMonkeytypeResultsCsv('{"v":1}')).toBe(false);
    expect(isMonkeytypeResultsCsv('id,startedAt,mode')).toBe(false);
  });

  it('parses every row into a valid history session', () => {
    const { sessions, errors } = parseMonkeytypeResultsCsv(CSV);
    expect(errors).toEqual([]);
    expect(sessions).toHaveLength(3);
    expect(sessions.map(validateSession)).toEqual([null, null, null]);
    const [a, b, c] = sessions;
    expect(a).toMatchObject({
      id: 'mt-6ab561d69503ffe34a04d147',
      source: 'monkeytype-history',
      startedAt: 1790271958000 - 60_000, // Monkeytype's timestamp is the END of the test
      config: { mode: 'time', mode2: '60', language: 'english', punctuation: false, numbers: false, funbox: [], difficulty: 'normal' },
      result: { wpm: 99, rawWpm: 102.2, acc: 96.02, consistency: 66.95, testDurationSec: 60, charStats: [495, 7, 2, 2] },
      completed: true,
      keyEvents: [],
      inputEvents: [],
      history: { mtId: '6ab561d69503ffe34a04d147', isPb: false, restartCount: 5, afkDurationSec: 1, tags: [] },
    });
    expect(b!.history!.isPb).toBe(true);
    expect(c).toMatchObject({ config: { mode: 'words', mode2: '10', funbox: ['layoutfluid', 'mirror'], difficulty: 'expert' }, completed: false });
  });

  it('reports bad rows and a wrong file', () => {
    const bad = parseMonkeytypeResultsCsv(`${HEADER}\r\nabc,false,notanumber,90,90,50,1;0;0;0,time,15,-1,0,15,0,0,false,false,english,,normal,false,false,false,,1790271958000`);
    expect(bad.sessions).toHaveLength(0);
    expect(bad.errors).toEqual(['line 2: missing or invalid values']);
    expect(parseMonkeytypeResultsCsv('a,b\n1,2').errors[0]).toContain('Monkeytype results export');
  });

  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
  });

  it('feeds speed/accuracy history, trends and streaks, but no keystroke statistics', () => {
    const { sessions } = parseMonkeytypeResultsCsv(CSV);
    const a = analyze(sessions);
    // finished tests only (the third is bailed out): (99*60 + 94.4*60) / 120 = 96.7 wpm, acc (96.02 + 91.79)/2 = 93.9
    expect(a.overall.wpm).toBe(96.7);
    expect(a.overall.acc).toBe(93.9);
    expect(a.keystrokes).toBe(0);
    expect(a.keys).toEqual([]);
    expect(buildProgress(sessions, {}, 1790271958000).points.length).toBeGreaterThan(0);
  });

  it('recognises a history row for a test the extension also recorded', () => {
    const recorded = makeSession({ id: 'rec', startedAt: 1790269336000 - 5380, text: 'a b', config: { mode: 'words', mode2: '10' }, result: { wpm: 111.52, rawWpm: 111.52, acc: 94.34, consistency: 69.67, testDurationSec: 5.38 } });
    const history = parseMonkeytypeResultsCsv(CSV).sessions[2]!;
    expect(isSameTest(history, recorded)).toBe(true); // ends 2 s apart, same mode and wpm
    expect(isSameTest(history, { ...recorded, result: { ...recorded.result!, wpm: 90 } })).toBe(false);
    expect(isSameTest(history, { ...recorded, config: { ...recorded.config, mode2: '25' } })).toBe(false);
  });
});
