// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@typelens/core/schema';
import { Recorder } from '../src/recorder';
import { attachCapture, parseDuration, parseResult, readWords, toSessionConfig } from '../src/content/capture';
import { healthCheck } from '../src/selectors';

const WORDS = ['long', 'increase', 'before', 'any', 'still', 'help'];

/** Builds a page shaped like monkeytype.com (structure verified against the live site). */
function buildPage(): void {
  document.body.innerHTML = `
    <div id="typingTest">
      <textarea id="wordsInput"></textarea>
      <div id="words">${WORDS.map((w, i) => `<div class="word${i === 0 ? ' active' : ''}" data-wordindex="${i}">${[...w].map((c) => `<letter>${c}</letter>`).join('')}</div>`).join('')}</div>
    </div>
    <input id="searchBox" />
    <div id="result" class="hidden">
      <div class="stats">
        <div class="group wpm"><div class="top">wpm</div><div class="bottom" aria-label="65.57 wpm">66</div></div>
        <div class="group acc"><div class="top">acc</div><div class="bottom" aria-label="97.84%&#10;181 correct&#10;4 incorrect">97%</div></div>
        <div class="group raw"><div class="bottom" aria-label="67.77 wpm">68</div></div>
        <div class="group key"><div class="bottom">179/3/1/0</div></div>
        <div class="group consistency"><div class="bottom" aria-label="72.5% (60% key)">73%</div></div>
        <div class="group time"><div class="bottom" aria-label="30s (0s afk 0%)">30s</div></div>
        <div class="group info"><div class="bottom"></div></div>
      </div>
    </div>`;
}

const CONFIG = JSON.stringify({ mode: 'time', time: 30, words: 50, punctuation: true, numbers: false, language: 'english', funbox: [], difficulty: 'normal' });

interface Ctl {
  sent: Session[];
  paused: boolean;
  recorder: Recorder;
  detach(): void;
}

function setup(): Ctl {
  buildPage();
  const sent: Session[] = [];
  const ctl = { sent, paused: false } as Ctl;
  ctl.recorder = new Recorder({ now: () => 1_700_000_000_000, uuid: () => 'sess-1', extVersion: 't' });
  const cap = attachCapture({
    doc: document,
    win: window as unknown as Window & typeof globalThis,
    recorder: ctl.recorder,
    send: (s) => sent.push(s),
    isPaused: () => ctl.paused,
    readConfigJson: () => CONFIG,
  });
  ctl.detach = cap.detach;
  return ctl;
}

let clock = 1000;
/** Simulates one key press the way a browser does: keydown -> value changes -> input -> keyup. */
function press(ta: HTMLTextAreaElement, ch: string): { down: KeyboardEvent; input: InputEvent } {
  clock += 130;
  const code = ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`;
  const down = new KeyboardEvent('keydown', { key: ch, code, bubbles: true, cancelable: true });
  ta.dispatchEvent(down);
  ta.value = ta.value + ch; // the browser applies the edit before `input`
  const input = new InputEvent('input', { inputType: 'insertText', data: ch, bubbles: true, cancelable: true });
  ta.dispatchEvent(input);
  ta.dispatchEvent(new KeyboardEvent('keyup', { key: ch, code, bubbles: true, cancelable: true }));
  return { down, input };
}
function backspace(ta: HTMLTextAreaElement): void {
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true }));
  ta.value = ta.value.slice(0, -1);
  ta.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', data: null, bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', bubbles: true }));
}
/** Monkeytype resets the box to " " and moves the active word after a commit; mimic that AFTER our listener ran. */
function advanceWord(next: number): void {
  const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
  ta.value = ' ';
  document.querySelector('#words .word.active')?.classList.remove('active');
  document.querySelector(`#words .word[data-wordindex="${next}"]`)?.classList.add('active');
}
function typeWordAndCommit(ta: HTMLTextAreaElement, word: string, wi: number): void {
  ta.value = ta.value || ' ';
  for (const c of word) press(ta, c);
  press(ta, ' ');
  advanceWord(wi + 1);
}
function showResult(): void {
  document.querySelector('#result')!.classList.remove('hidden');
}

let ctl: Ctl;
beforeEach(() => {
  vi.useFakeTimers();
  ctl = setup();
});
afterEach(() => {
  ctl.detach();
  vi.useRealTimers();
});

describe('capture on a Monkeytype-shaped page', () => {
  it('records a whole test and emits one completed session when #result appears', async () => {
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    typeWordAndCommit(ta, 'long', 0);
    typeWordAndCommit(ta, 'increase', 1);
    showResult();
    await vi.advanceTimersByTimeAsync(10);
    expect(ctl.sent).toHaveLength(1);
    const s = ctl.sent[0]!;
    expect(s.completed).toBe(true);
    expect(s.config).toMatchObject({ mode: 'time', mode2: '30', language: 'english', punctuation: true, difficulty: 'normal' });
    expect(s.words.slice(0, 3)).toEqual(['long', 'increase', 'before']);
    expect(s.result).toMatchObject({ wpm: 65.57, acc: 97.84, rawWpm: 67.77, consistency: 72.5, testDurationSec: 30, charStats: [179, 3, 1, 0] });
    const ins = s.inputEvents.filter((e) => e.op === 'ins');
    expect(ins.map((e) => e.typed).join('')).toBe('longincrease');
    expect(ins.every((e) => e.correct)).toBe(true);
    expect(ins[0]).toMatchObject({ wi: 0, ci: 0, expected: 'l' });
    expect(ins[4]).toMatchObject({ wi: 1, ci: 0, expected: 'i' }); // first char of word 1
    const commits = s.inputEvents.filter((e) => e.op === 'commit');
    expect(commits).toEqual([expect.objectContaining({ wi: 0, ci: 4 }), expect.objectContaining({ wi: 1, ci: 8 })]);
    // every keydown has a matching keyup
    expect(s.keyEvents.filter((k) => k.type === 'down')).toHaveLength(s.keyEvents.filter((k) => k.type === 'up').length);
  });

  it('marks mistakes against the ORIGINAL word text and records the correcting Backspace', async () => {
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    press(ta, 'l');
    press(ta, 'x'); // wrong: expected 'o'
    backspace(ta);
    press(ta, 'o');
    press(ta, 'n');
    press(ta, 'g');
    press(ta, ' ');
    advanceWord(1);
    typeWordAndCommit(ta, 'increase', 1);
    showResult();
    await vi.advanceTimersByTimeAsync(10);
    const s = ctl.sent[0]!;
    expect(s.inputEvents[1]).toMatchObject({ op: 'ins', typed: 'x', expected: 'o', correct: false, ci: 1 });
    expect(s.inputEvents[2]).toMatchObject({ op: 'del', wi: 0, ci: 1 });
    expect(s.inputEvents[3]).toMatchObject({ op: 'ins', typed: 'o', correct: true, ci: 1 });
  });

  it('is fully passive: never cancels or stops any event', async () => {
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    const { down, input } = press(ta, 'l');
    expect(down.defaultPrevented).toBe(false);
    expect(input.defaultPrevented).toBe(false);
    // a page-level listener added AFTER ours still sees the event (propagation was not stopped)
    const seen = vi.fn();
    document.body.addEventListener('keydown', seen);
    press(ta, 'o');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('ignores every other input on the page (search box, login fields, command line)', async () => {
    const other = document.querySelector('#searchBox') as HTMLInputElement;
    for (const ch of 'hunter2pass') {
      other.dispatchEvent(new KeyboardEvent('keydown', { key: ch, code: `Key${ch.toUpperCase()}`, bubbles: true }));
      other.value += ch;
      other.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch, bubbles: true }));
      other.dispatchEvent(new KeyboardEvent('keyup', { key: ch, code: `Key${ch.toUpperCase()}`, bubbles: true }));
    }
    expect(ctl.recorder.snapshot()).toEqual({ active: false, inputs: 0, maxWi: 0 });
    showResult();
    await vi.advanceTimersByTimeAsync(10);
    expect(ctl.sent).toHaveLength(0);
  });

  it('records nothing while paused', async () => {
    ctl.paused = true;
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    for (const c of 'longi') press(ta, c);
    expect(ctl.recorder.snapshot().active).toBe(false);
  });

  it('a failed test ("failed" in the info box) is stored as incomplete', async () => {
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    typeWordAndCommit(ta, 'long', 0);
    typeWordAndCommit(ta, 'increase', 1);
    document.querySelector('#result .group.info .bottom')!.textContent = 'failed (slow timer)afk detected';
    showResult();
    await vi.advanceTimersByTimeAsync(10);
    expect(ctl.sent[0]?.completed).toBe(false);
  });

  it('flushes an incomplete session when the word list is rebuilt with the SAME words (repeat test)', async () => {
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    typeWordAndCommit(ta, 'long', 0);
    typeWordAndCommit(ta, 'increase', 1);
    // Monkeytype rebuilds the word list on restart: fresh elements, identical text
    const words = document.querySelector('#words')!;
    words.innerHTML = WORDS.map((w, i) => `<div class="word${i === 0 ? ' active' : ''}" data-wordindex="${i}">${[...w].map((c) => `<letter>${c}</letter>`).join('')}</div>`).join('');
    ta.value = ' ';
    await vi.advanceTimersByTimeAsync(10);
    expect(ctl.sent).toHaveLength(1);
    expect(ctl.sent[0]).toMatchObject({ completed: false });
    expect(ctl.sent[0]!.flags).toContain('restart');
    expect(ctl.recorder.snapshot().active).toBe(false);
    press(ta, 'l'); // the new test starts cleanly at word 0
    expect(ctl.recorder.snapshot()).toMatchObject({ active: true, inputs: 1 });
  });

  it('does NOT treat word scrolling (appending words / removing early ones) as a restart', async () => {
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    typeWordAndCommit(ta, 'long', 0);
    typeWordAndCommit(ta, 'increase', 1);
    const words = document.querySelector('#words')!;
    words.insertAdjacentHTML('beforeend', '<div class="word" data-wordindex="6"><letter>z</letter></div>');
    words.querySelector('.word[data-wordindex="0"]')!.remove();
    await vi.advanceTimersByTimeAsync(300);
    expect(ctl.sent).toHaveLength(0);
    expect(ctl.recorder.snapshot().active).toBe(true);
  });

  it("tracks the word index from the input stream even when Monkeytype's DOM lags (throttled tab)", async () => {
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    // the DOM never advances `.active`; only the textarea is reset after each commit
    for (const [wi, w] of ['long', 'increase', 'before'].entries()) {
      for (const c of w) press(ta, c);
      press(ta, ' ');
      ta.value = ' ';
      void wi;
    }
    showResult();
    await vi.advanceTimersByTimeAsync(10);
    const s = ctl.sent[0]!;
    const ins = s.inputEvents.filter((e) => e.op === 'ins');
    expect(ins.every((e) => e.correct)).toBe(true); // 'increase' is compared with word 1, not word 0
    expect(ins.filter((e) => e.wi === 1).map((e) => e.typed).join('')).toBe('increase');
    expect(ins.filter((e) => e.wi === 2).map((e) => e.typed).join('')).toBe('before');
    expect(s.inputEvents.filter((e) => e.op === 'commit').map((e) => e.wi)).toEqual([0, 1, 2]);
  });

  it('follows Backspace back into the previous word and resumes typing in it', async () => {
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    press(ta, 'l');
    press(ta, 'o');
    press(ta, ' '); // commits an incomplete word 0 ("lo")
    ta.value = ' ';
    // Backspace at the start of word 1: the browser deletes the leading space, leaving ""
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true }));
    ta.value = '';
    ta.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', data: null, bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', bubbles: true }));
    ta.value = ' lo'; // Monkeytype restores word 0's typed text after our listener ran
    press(ta, 'n');
    press(ta, 'g');
    press(ta, ' ');
    ta.value = ' ';
    for (const c of 'increase') press(ta, c);
    press(ta, ' ');
    showResult();
    await vi.advanceTimersByTimeAsync(10);
    const s = ctl.sent[0]!;
    const ev = s.inputEvents;
    expect(ev.map((e) => `${e.op}${e.wi}.${e.ci}`).slice(0, 8)).toEqual(['ins0.0', 'ins0.1', 'commit0.2', 'del0.2', 'ins0.2', 'ins0.3', 'commit0.4', 'ins1.0']);
    expect(ev.filter((e) => e.op === 'ins' && e.wi === 0).every((e) => e.correct)).toBe(true);
  });
  it('does not emit a second session when #result changes but stays visible', async () => {
    const ta = document.querySelector('#wordsInput') as HTMLTextAreaElement;
    ta.value = ' ';
    typeWordAndCommit(ta, 'long', 0);
    typeWordAndCommit(ta, 'increase', 1);
    showResult();
    document.querySelector('#result')!.classList.add('extra-class');
    await vi.advanceTimersByTimeAsync(10);
    expect(ctl.sent).toHaveLength(1);
  });
});

describe('pure DOM readers', () => {
  it('readWords excludes extra letters and keeps word indexes', async () => {
    document.querySelector('#words .word[data-wordindex="0"]')!.insertAdjacentHTML('beforeend', '<letter class="extra">z</letter>');
    expect(readWords(document).slice(0, 2)).toEqual([
      { wi: 0, text: 'long' },
      { wi: 1, text: 'increase' },
    ]);
  });

  it('parseResult returns null when the numbers are missing', async () => {
    document.querySelector('#result .group.wpm .bottom')!.removeAttribute('aria-label');
    document.querySelector('#result .group.wpm .bottom')!.textContent = '';
    expect(parseResult(document)).toBeNull();
  });

  it('toSessionConfig maps modes, legacy funbox strings and tolerates junk', async () => {
    expect(toSessionConfig(null)).toBeNull();
    expect(toSessionConfig('{not json')).toBeNull();
    expect(toSessionConfig(JSON.stringify({ mode: 'words', words: 50, language: 'german', funbox: 'nausea#mirror' }))).toMatchObject({ mode: 'words', mode2: '50', language: 'german', funbox: ['nausea', 'mirror'] });
    expect(toSessionConfig(JSON.stringify({ mode: 'quote', quoteLength: [0, 1] }))?.mode2).toBe('0-1');
    expect(toSessionConfig(JSON.stringify({ mode: 'zen', funbox: 'none' }))).toMatchObject({ mode: 'zen', mode2: 'zen', funbox: [] });
  });

  it('healthCheck reports missing selectors', async () => {
    expect(healthCheck(document)).toEqual({ ok: true, missing: [] });
    document.querySelector('#result')!.remove();
    expect(healthCheck(document)).toEqual({ ok: false, missing: ['#result'] });
  });
});

describe('parseResult on the current Monkeytype result screen (v26.32)', () => {
  /** result screen built the way Monkeytype's result.ts writes it (textContent + aria-labels) */
  function resultScreen(g: { wpm: [string, string?]; raw: [string, string?]; acc: [string, string?]; cons: [string, string?]; time: string; chars: string }): void {
    const b = (text: string, aria?: string) => `<div class="bottom"${aria !== undefined ? ` aria-label="${aria}"` : ''}>${text}</div>`;
    document.body.innerHTML = `<div id="result"><div class="stats">
      <div class="group wpm">${b(...g.wpm)}</div>
      <div class="group raw">${b(...g.raw)}</div>
      <div class="group acc">${b(...g.acc)}</div>
      <div class="group consistency">${b(...g.cons)}</div>
      <div class="group key"><div class="bottom">${g.chars}</div></div>
      <div class="group time"><div class="bottom"><div class="text">${g.time}</div><div class="afk">0% afk</div><div class="timeToday">00:00:04 session</div></div></div>
      <div class="group info"><div class="bottom"></div></div>
    </div></div>`;
  }

  it('reads the user\'s real failing case: 100% accuracy (aria only holds correct/incorrect) and key consistency in aria', () => {
    // the real test that was mis-read as "45% acc, 18.03% consistency, 0 s"
    resultScreen({
      wpm: ['134.33', '134.33 wpm'],
      raw: ['134.33'],
      acc: ['100%', '45 correct&#10;0 incorrect'],
      cons: ['74.51%', '18.03% key'],
      time: '4.03s',
      chars: '45/0/0/0',
    });
    expect(parseResult(document)?.result).toEqual({ wpm: 134.33, rawWpm: 134.33, acc: 100, consistency: 74.51, testDurationSec: 4.03, charStats: [45, 0, 0, 0] });
  });

  it('keeps the precise aria value only when it agrees with what is shown', () => {
    resultScreen({ wpm: ['66', '65.57 wpm'], raw: ['68', '67.77 wpm'], acc: ['98%', '97.84%&#10;181 correct&#10;4 incorrect'], cons: ['81%', '60.2% key'], time: '30s', chars: '179/3/1/0' });
    expect(parseResult(document)?.result).toMatchObject({ wpm: 65.57, rawWpm: 67.77, acc: 97.84, consistency: 81, testDurationSec: 30 });
  });

  it('with a non-wpm speed unit, still takes wpm from an aria-label that says wpm', () => {
    resultScreen({ wpm: ['610.5', '122.1 wpm'], raw: ['650', '130 wpm'], acc: ['95%'], cons: ['70%'], time: '1:05', chars: '1/0/0/0' });
    expect(parseResult(document)?.result).toMatchObject({ wpm: 122.1, rawWpm: 130, acc: 95, testDurationSec: 65 });
  });
});

describe('parseDuration', () => {
  it('handles every format Monkeytype shows', () => {
    expect(parseDuration('4.03s')).toBe(4.03);
    expect(parseDuration('65s')).toBe(65);
    expect(parseDuration('1:05')).toBe(65);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('1m 5s')).toBe(65);
    expect(parseDuration('2h 1m 3s')).toBe(7263);
    expect(Number.isNaN(parseDuration(''))).toBe(true);
  });
});