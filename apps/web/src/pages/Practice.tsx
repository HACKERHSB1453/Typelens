import { PageHeader } from '@/components/ui/PageHeader';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PREF_PRACTICE_HISTORY } from '@typelens/host-contract';
import { getHost } from '@/host';
import { useSearchParams } from 'react-router-dom';
import { Check, Clipboard, Trash2, Wand2 } from 'lucide-react';
import { useFilters } from '@/hooks/useFilters';
import { useDataSource } from '@/data';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Slider } from '@/components/ui/Slider';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Retry } from '@/components/ui/Retry';
import { ALL_FINGERS, FINGER_INFO, KEY_BY_CODE, KEY_DEFS } from '@/data/keymap';
import { cn, formatDateTime } from '@/lib/utils';
import type { FingerId, PracticeFocus, PracticeRequest, PracticeResult } from '@/data/types';

type FocusMode = 'auto' | 'grams' | 'keys' | 'fingers';
type Emphasis = 'accuracy' | 'speed' | 'balanced';
type HandSel = 'both' | 'L' | 'R';

const HISTORY_LIMIT = 10;

interface HistoryEntry {
  text: string;
  focus: string;
  generatedAt: number;
}

async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const parsed = await getHost().prefs.get<unknown>(PREF_PRACTICE_HISTORY);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is HistoryEntry =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as HistoryEntry).text === 'string' &&
        typeof (x as HistoryEntry).focus === 'string' &&
        typeof (x as HistoryEntry).generatedAt === 'number',
    );
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  // fire and forget: a history that fails to save is only an inconvenience
  getHost().prefs.set(PREF_PRACTICE_HISTORY, entries).catch(() => undefined);
}

function describeFocus(
  mode: FocusMode,
  gramsInput: string,
  codes: string[],
  fingers: FingerId[],
): string {
  switch (mode) {
    case 'auto':
      return 'auto';
    case 'grams':
      return `grams: ${gramsInput}`;
    case 'keys':
      return `keys: ${codes.map((c) => KEY_BY_CODE[c]?.char ?? c).join('')}`;
    case 'fingers':
      return `fingers: ${fingers.join(',')}`;
    default:
      return 'auto';
  }
}

/** Wrap every occurrence of any `needles` substring inside a single word in <mark>. */
function highlightWord(word: string, needles: string[]): ReactNode {
  if (!needles.length || !word) return word;
  const matches: Array<{ start: number; end: number }> = [];
  for (const n of needles) {
    if (!n) continue;
    let i = 0;
    while ((i = word.indexOf(n, i)) !== -1) {
      matches.push({ start: i, end: i + n.length });
      i += n.length;
    }
  }
  if (matches.length === 0) return word;
  matches.sort((a, b) => a.start - b.start || a.end - b.end);
  const nodes: ReactNode[] = [];
  let pos = 0;
  for (const m of matches) {
    if (m.start < pos) continue; // skip overlaps
    if (m.start > pos) nodes.push(word.slice(pos, m.start));
    nodes.push(
      <mark key={`${m.start}-${m.end}`} className="rounded bg-main/30 text-[var(--main)]">
        {word.slice(m.start, m.end)}
      </mark>,
    );
    pos = m.end;
  }
  if (pos < word.length) nodes.push(word.slice(pos));
  return <>{nodes}</>;
}

/** Split on whitespace (capturing separators) so each word can be highlighted. */
function highlightText(text: string, needles: string[]): ReactNode {
  if (!needles.length) return text;
  const pieces = text.split(/(\s+)/);
  return pieces.map((piece, i) => (
    <Fragment key={i}>{piece.trim() === '' ? piece : highlightWord(piece, needles)}</Fragment>
  ));
}

/**
 * Practice page — builds custom typing drills driven by the shared
 * generatePractice data source. Supports auto / grams / keys / fingers focus
 * modes pre-filled via query params (the contract every "Practice this" button
 * uses), keeps the last 10 generated texts in the host's preferences for quick reuse.
 */
export function Practice() {
  const { filters } = useFilters();
  const ds = useDataSource();
  const [searchParams] = useSearchParams();

  const [focusMode, setFocusMode] = useState<FocusMode>('auto');
  const [gramsInput, setGramsInput] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [selectedFingers, setSelectedFingers] = useState<FingerId[]>([]);
  const [length, setLength] = useState(50);
  const [emphasis, setEmphasis] = useState<Emphasis>('balanced');
  const [hand, setHand] = useState<HandSel>('both');

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<Error | null>(null);
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Load persisted history on mount.
  useEffect(() => {
    let alive = true;
    void loadHistory().then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, []);

  // Sync from URL query params on mount and whenever the URL changes externally
  // (e.g. another page's "Practice this" button navigates here).
  useEffect(() => {
    const raw = searchParams.get('focus');
    const focus: FocusMode =
      raw === 'auto' || raw === 'grams' || raw === 'keys' || raw === 'fingers' ? raw : 'auto';
    setFocusMode(focus);
    if (focus === 'grams') {
      setGramsInput(searchParams.get('grams') ?? '');
    }
    if (focus === 'keys') {
      const codes = (searchParams.get('codes') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      setSelectedCodes(codes);
    }
    if (focus === 'fingers') {
      const fingers = (searchParams.get('fingers') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as FingerId[];
      setSelectedFingers(fingers);
    }
  }, [searchParams]);

  const focusForRequest = useMemo<PracticeFocus>(() => {
    switch (focusMode) {
      case 'grams':
        return {
          kind: 'grams',
          grams: gramsInput
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        };
      case 'keys':
        return { kind: 'keys', codes: selectedCodes };
      case 'fingers':
        return { kind: 'fingers', fingers: selectedFingers };
      case 'auto':
      default:
        return { kind: 'auto' };
    }
  }, [focusMode, gramsInput, selectedCodes, selectedFingers]);

  // Needles to highlight in the rendered text: `result.focus` holds grams and
  // single characters; a KeyboardEvent.code, if one appears, is mapped to its char.
  const needles = useMemo<string[]>(() => {
    if (!result) return [];
    const all = result.focus.map((item) => KEY_BY_CODE[item]?.char ?? item).filter((item) => item.length > 0);
    // single letters would highlight half the text; show them only when no longer patterns were chosen
    const multi = all.filter((n) => n.length > 1);
    return multi.length ? multi : all;
  }, [result]);

  function persistHistory(prev: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
    const next = [entry, ...prev].slice(0, HISTORY_LIMIT);
    saveHistory(next);
    return next;
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const req: PracticeRequest = {
        focus: focusForRequest,
        length,
        emphasis,
        hand,
        filters,
      };
      const res = await ds.generatePractice(req);
      setResult(res);
      setHistory((prev) =>
        persistHistory(
          prev,
          {
            text: res.text,
            focus: describeFocus(focusMode, gramsInput, selectedCodes, selectedFingers),
            generatedAt: res.generatedAt,
          },
        ),
      );
    } catch (e) {
      setGenerateError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  function handleClearHistory() {
    setHistory([]);
    saveHistory([]);
  }

  function handleLoadHistory(entry: HistoryEntry) {
    setResult({
      text: entry.text,
      words: entry.text.split(' '),
      focus: [],
      coverage: {},
      generatedAt: entry.generatedAt,
    });
    setGenerateError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Practice" description="Generate drill text from your weakest n-grams, keys or fingers, then paste it into Monkeytype." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Config card */}
        <Card>
          <CardHeader
            title="Generate practice text"
            subtitle="Build a custom typing drill from your weakest n-grams."
          />
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-wide text-[var(--sub)]">Focus</label>
              <Segmented<FocusMode>
                value={focusMode}
                onChange={setFocusMode}
                ariaLabel="Practice focus"
                options={[
                  { value: 'auto', label: 'auto' },
                  { value: 'grams', label: 'grams' },
                  { value: 'keys', label: 'keys' },
                  { value: 'fingers', label: 'fingers' },
                ]}
              />
              {focusMode === 'auto' && (
                <p className="text-xs text-[var(--sub)]">
                  Uses your current weakest bigrams automatically.
                </p>
              )}
              {focusMode === 'grams' && (
                <Input
                  placeholder="th,ing,er"
                  value={gramsInput}
                  onChange={(e) => setGramsInput(e.target.value)}
                  aria-label="Comma-separated grams"
                />
              )}
              {focusMode === 'keys' && (
                <div className="max-h-44 overflow-auto rounded-md border border-[var(--sub-2)] bg-[var(--bg-dark)] p-2">
                  <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                    {KEY_DEFS.filter((k) => k.code !== 'Space').map((k) => {
                      const active = selectedCodes.includes(k.code);
                      return (
                        <button
                          key={k.code}
                          type="button"
                          onClick={() =>
                            setSelectedCodes((prev) =>
                              prev.includes(k.code)
                                ? prev.filter((c) => c !== k.code)
                                : [...prev, k.code],
                            )
                          }
                          className={cn(
                            'rounded border px-2 py-1.5 font-mono text-xs transition',
                            active
                              ? 'border-[var(--main)] bg-main/20 text-[var(--main)]'
                              : 'border-[var(--sub-2)] text-[var(--sub)] hover:text-[var(--text)]',
                          )}
                          aria-pressed={active}
                          title={k.code}
                        >
                          {k.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {focusMode === 'fingers' && (
                <div className="flex flex-wrap gap-1.5">
                  {ALL_FINGERS.map((f) => {
                    const active = selectedFingers.includes(f);
                    const info = FINGER_INFO[f];
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() =>
                          setSelectedFingers((prev) =>
                            prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
                          )
                        }
                        className={cn(
                          'rounded border px-2 py-1 text-xs transition',
                          active
                            ? 'border-[var(--main)] bg-main/20 text-[var(--main)]'
                            : 'border-[var(--sub-2)] text-[var(--sub)] hover:text-[var(--text)]',
                        )}
                        aria-pressed={active}
                        title={info.name}
                      >
                        {info.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wide text-[var(--sub)]">
                  Length (words)
                </label>
                <span className="tnum text-sm text-[var(--text)]">{length}</span>
              </div>
              <Slider
                min={10}
                max={500}
                step={1}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                aria-label="Practice length in words"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-wide text-[var(--sub)]">Emphasis</label>
              <Segmented<Emphasis>
                value={emphasis}
                onChange={setEmphasis}
                ariaLabel="Emphasis"
                options={[
                  { value: 'accuracy', label: 'accuracy' },
                  { value: 'speed', label: 'speed' },
                  { value: 'balanced', label: 'balanced' },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-wide text-[var(--sub)]">Hand</label>
              <Segmented<HandSel>
                value={hand}
                onChange={setHand}
                ariaLabel="Hand"
                options={[
                  { value: 'both', label: 'both' },
                  { value: 'L', label: 'left' },
                  { value: 'R', label: 'right' },
                ]}
              />
            </div>

            <Button variant="primary" onClick={handleGenerate} disabled={generating}>
              {generating ? <Spinner size="sm" /> : <Wand2 className="h-4 w-4" aria-hidden />}
              Generate
            </Button>
            {generateError && <Retry error={generateError} onRetry={handleGenerate} />}
          </div>
        </Card>

        {/* Result card */}
        <Card>
          <CardHeader
            title="Result"
            subtitle={result ? `${result.words.length} words` : undefined}
            right={
              result ? (
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-[var(--ok)]" aria-hidden />
                  ) : (
                    <Clipboard className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              ) : undefined
            }
          />
          {result ? (
            <div className="flex flex-col gap-3">
              <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-[var(--sub-2)] bg-[var(--bg-dark)] p-3 font-mono text-sm leading-relaxed">
                {highlightText(result.text, needles)}
              </div>
              {Object.keys(result.coverage).length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--sub)]">
                    Coverage
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(result.coverage).map(([k, n]) => (
                      <Badge key={k} tone="main" className="tnum">
                        {k}: ×{n}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title="No practice text yet"
              hint="Pick a focus, set a length, and click Generate to build a custom drill."
            />
          )}
        </Card>
      </div>

      {/* 3-step instructions */}
      <Card>
        <CardHeader title="How to practice" subtitle="Three steps to drill this text on Monkeytype." />
        <ol className="flex flex-col gap-3">
          <InstructionStep n={1} title="Open monkeytype.com" hint="The free typing test this dashboard reads from." />
          <InstructionStep n={2} title="Choose custom" hint="Click custom in the bar above the test, then click change to open the text box." />
          <InstructionStep n={3} title="Paste and start" hint="Paste the text, press ok, and type it. TypeLens links the test to this drill so you can see before/after." />
        </ol>
      </Card>

      {/* History */}
      <Card>
        <CardHeader
          title="History"
          subtitle={`The last ${HISTORY_LIMIT} generated drills.`}
          right={
            history.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={handleClearHistory}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear
              </Button>
            ) : undefined
          }
        />
        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--sub-2)] p-4 text-center text-xs text-[var(--sub)]">
            No history yet. Generated texts will appear here for quick reuse.
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--sub-2)]">
            {history.map((entry, i) => (
              <li key={`${entry.generatedAt}-${i}`}>
                <button
                  type="button"
                  onClick={() => handleLoadHistory(entry)}
                  className="-mx-2 flex w-full items-center gap-3 rounded px-2 py-2 text-left transition hover:bg-[var(--bg-elev)]"
                >
                  <Clipboard className="h-3.5 w-3.5 shrink-0 text-[var(--sub)]" aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-mono text-xs text-[var(--text)]">{entry.text}</span>
                    <span className="text-[10px] text-[var(--sub)]">
                      {formatDateTime(entry.generatedAt)} · {entry.focus}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function InstructionStep({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--main)] text-[10px] font-bold text-[var(--main)]">
        {n}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-[var(--text)]">{title}</span>
        <span className="text-xs text-[var(--sub)]">{hint}</span>
      </div>
    </li>
  );
}
