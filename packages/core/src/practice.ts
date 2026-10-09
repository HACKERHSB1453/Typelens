/**
 * Local (no AI) weak-spot practice text: pick the n-grams/keys you are worst at, then draw real words
 * from a word list that contain them, weighted, so the text can be pasted into Monkeytype's Custom mode.
 */
import type { Analysis, KeyStat, NgramStat, PracticeRequest, PracticeResult } from './schema';
import { KEYS, codesForFinger } from './layout';

export interface PracticeOptions {
  rng: () => number;
  now: number;
}

interface FocusItem {
  /** shown in the UI and used as the key in `coverage` */
  label: string;
  /** what to look for inside a word */
  text: string;
  weight: number;
}

const AUTO_GRAMS = 12;
const AUTO_KEYS = 4;
/** no single focus item may appear in more than this share of the generated words */
const MAX_SHARE = 0.4;

function countOccurrences(word: string, text: string): number {
  let n = 0;
  for (let i = word.indexOf(text); i !== -1; i = word.indexOf(text, i + 1)) n++;
  return n;
}

interface Raw {
  label: string;
  text: string;
  acc: number;
  speed: number;
}

/** Turns raw accuracy/speed pain into weights 0..1 according to the emphasis. */
function weigh(items: Raw[], emphasis: PracticeRequest['emphasis']): FocusItem[] {
  const maxAcc = Math.max(0, ...items.map((i) => i.acc));
  const maxSpeed = Math.max(0, ...items.map((i) => i.speed));
  return items.map((i) => {
    const a = maxAcc > 0 ? i.acc / maxAcc : 0;
    const s = maxSpeed > 0 ? i.speed / maxSpeed : 0;
    const weight = emphasis === 'accuracy' ? a : emphasis === 'speed' ? s : 0.5 * (a + s);
    return { label: i.label, text: i.text, weight };
  });
}

/** evidence weight: few samples are mostly noise (same pseudo-count the analysis ranks with) */
const evidence = (count: number): number => count / (count + 20);

function gramRaw(g: NgramStat): Raw {
  const c = evidence(g.count);
  return { label: g.gram, text: g.gram, acc: g.errorRate * c, speed: Math.max(g.costMs, 0) * c };
}

function keyRaw(k: KeyStat, overallIki: number): Raw {
  const c = evidence(k.count);
  return { label: k.char, text: k.char, acc: k.errorRate * c, speed: Math.max(k.medianIkiMs - overallIki, 0) * c };
}

function pickFocus(req: PracticeRequest, a: Analysis): FocusItem[] {
  const emphasis = req.emphasis;
  const f = req.focus;
  const items: FocusItem[] = [];

  if (f.kind === 'auto') {
    const grams = weigh([...a.bigrams, ...a.trigrams].filter((g) => !g.gram.includes('␣')).map(gramRaw), emphasis);
    grams.sort((x, y) => y.weight - x.weight || x.label.localeCompare(y.label));
    items.push(...grams.filter((g) => g.weight > 0).slice(0, AUTO_GRAMS));
    const letters = a.keys.filter((k) => /^[a-z]$/.test(k.char));
    const keys = weigh(letters.map((k) => keyRaw(k, a.overall.medianIkiMs)), emphasis);
    keys.sort((x, y) => y.weight - x.weight || x.label.localeCompare(y.label));
    items.push(...keys.filter((k) => k.weight > 0).slice(0, AUTO_KEYS));
    return items;
  }

  // Explicit requests: use the measured pain when there is some, otherwise a flat weight of 1.
  const known = (raw: Raw[]): Map<string, number> => new Map(weigh(raw, emphasis).map((w) => [w.label, w.weight]));
  if (f.kind === 'grams') {
    const stat = known([...a.bigrams, ...a.trigrams].map(gramRaw));
    for (const g of f.grams) {
      if (g.includes('␣') || g.length < 1) continue;
      const w = stat.get(g);
      items.push({ label: g, text: g, weight: w && w > 0 ? w : 1 });
    }
    return items;
  }
  const codes = f.kind === 'keys' ? f.codes : f.fingers.flatMap((fg) => codesForFinger(fg));
  const stat = known(a.keys.map((k) => keyRaw(k, a.overall.medianIkiMs)));
  for (const code of codes) {
    const info = KEYS[code];
    if (!info || !/^[a-z0-9.,;'/\-]$/.test(info.char)) continue; // skip Space, Enter, brackets... (not useful inside words)
    const w = stat.get(info.char);
    items.push({ label: info.char, text: info.char, weight: w && w > 0 ? w : 1 });
  }
  return items;
}

function handFilter(words: string[], hand: 'both' | 'L' | 'R', length: number): string[] {
  if (hand === 'both') return words;
  const mine = new Set(Object.entries(KEYS).filter(([c, k]) => c.startsWith('Key') && k.hand === hand).map(([, k]) => k.char));
  const share = (w: string): number => [...w].filter((ch) => mine.has(ch)).length / w.length;
  const strict = words.filter((w) => share(w) === 1);
  if (strict.length >= length / 4) return strict;
  return words.filter((w) => share(w) >= 0.7);
}

export function generatePractice(req: PracticeRequest, analysis: Analysis, wordList: readonly string[], opts: PracticeOptions): PracticeResult {
  const length = Math.max(1, Math.min(500, Math.floor(req.length)));
  const focus = pickFocus(req, analysis).filter((f) => f.weight > 0);
  const clean = [...new Set(wordList.filter((w) => /^[a-z]+$/.test(w)))];
  const words = handFilter(clean, req.hand, length);
  const pool = words.length ? words : clean;

  const score = (w: string): number => {
    let s = 0;
    for (const f of focus) s += f.weight * countOccurrences(w, f.text);
    return s / Math.sqrt(w.length);
  };
  const scored = pool.map((w) => ({ w, s: score(w) })).filter((x) => x.s > 0);
  const scoredSet = new Set(scored.map((x) => x.w));
  const filler = pool.filter((w) => !scoredSet.has(w));

  const cap = Math.max(1, Math.ceil(MAX_SHARE * length));
  const coverage: Record<string, number> = Object.fromEntries(focus.map((f) => [f.label, 0]));
  const itemsIn = (w: string): string[] => focus.filter((f) => w.includes(f.text)).map((f) => f.label);
  const underCap = (w: string): boolean => itemsIn(w).every((l) => (coverage[l] as number) < cap);
  const rng = opts.rng;

  const draw = <T extends { s: number }>(list: T[]): number => {
    const total = list.reduce((t, x) => t + x.s, 0);
    let r = rng() * total;
    const i = list.findIndex((x) => (r -= x.s) < 0);
    return i < 0 ? list.length - 1 : i;
  };

  const picked: string[] = [];
  const commit = (w: string): void => {
    picked.push(w);
    for (const l of itemsIn(w)) coverage[l] = (coverage[l] as number) + 1;
  };

  let bag = [...scored]; // scored words not yet used in this pass
  let fillBag = filler.map((w) => ({ w, s: 1 }));
  const notLast = (w: string): boolean => w !== picked[picked.length - 1];

  while (picked.length < length) {
    // 1) a weighted draw among scored words that keep every focus item under its cap
    let eligible = bag.filter((x) => notLast(x.w) && underCap(x.w));
    if (eligible.length === 0 && bag.length === 0 && scored.length > 0) {
      bag = [...scored]; // another pass, so a small word list can still fill the text
      eligible = bag.filter((x) => notLast(x.w) && underCap(x.w));
    }
    if (eligible.length > 0) {
      const w = (eligible[draw(eligible)] as { w: string }).w;
      bag.splice(bag.findIndex((x) => x.w === w), 1);
      commit(w);
      continue;
    }
    // 2) unrelated filler words keep the drill varied once the capped items are used up
    if (fillBag.length === 0) fillBag = filler.map((w) => ({ w, s: 1 }));
    const fillers = fillBag.filter((x) => notLast(x.w));
    if (fillers.length > 0) {
      const w = (fillers[draw(fillers)] as { w: string }).w;
      fillBag.splice(fillBag.findIndex((x) => x.w === w), 1);
      commit(w);
      continue;
    }
    // 3) no filler exists at all (every word contains a focus item): relax the cap rather than stop
    const any = (bag.length ? bag : scored).filter((x) => notLast(x.w));
    if (any.length === 0) break;
    const w = (any[draw(any)] as { w: string }).w;
    const at = bag.findIndex((x) => x.w === w);
    if (at >= 0) bag.splice(at, 1);
    commit(w);
  }
  const final = picked.slice(0, length);
  // report only what the text really drills: an item no generated word contains was not practised
  const used = focus.filter((f) => (coverage[f.label] ?? 0) > 0);
  return { text: final.join(' '), words: final, focus: used.map((f) => f.label), coverage: Object.fromEntries(used.map((f) => [f.label, coverage[f.label] as number])), generatedAt: opts.now };
}
