import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import { useFilters } from '@/hooks/useFilters';
import { useReplay, useSessions } from '@/hooks/useData';
import { typedStateAt } from '@typelens/core';
import { TestResultChart } from '@/components/charts/TestResultChart';
import { Keyboard } from '@/components/keyboard/Keyboard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { SortableTable, type Column } from '@/components/ui/SortableTable';
import { StateView } from '@/components/ui/StateView';
import { formatDateTime, formatDuration, formatNumber } from '@/lib/utils';
import type { KeyEvent, ReplayData, SessionSummary, TypedState, WordBurst } from '@/data/types';

/* ============================================================================
 * Replay page — handles BOTH /replay (session picker) and /replay/:id (player).
 * ------------------------------------------------------------------------- */

export function Replay() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <ReplayPicker />;
  return <ReplayView sessionId={id} />;
}

/* ============================================================================
 * Session picker (route /replay)
 * ------------------------------------------------------------------------- */

function ReplayPicker() {
  const navigate = useNavigate();
  const { filters } = useFilters();
  const { data, loading, error, retry } = useSessions(filters);

  const columns: Column<SessionSummary>[] = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date',
        sortValue: (s) => s.startedAt,
        cell: (s) => <span className="whitespace-nowrap">{formatDateTime(s.startedAt)}</span>,
      },
      {
        key: 'mode',
        header: 'Mode',
        sortValue: (s) => s.config.mode,
        cell: (s) => (<span className="lowercase">{s.config.mode} {s.config.mode2}{!s.completed && <Badge tone="sub" className="ml-2">restarted</Badge>}</span>),
      },
      {
        key: 'lang',
        header: 'Lang',
        sortValue: (s) => s.config.language,
        cell: (s) => s.config.language,
      },
      {
        key: 'wpm',
        header: 'WPM',
        align: 'right',
        sortValue: (s) => s.wpm,
        cell: (s) => formatNumber(s.wpm, 1),
      },
      {
        key: 'acc',
        header: 'Accuracy',
        align: 'right',
        sortValue: (s) => s.acc,
        cell: (s) => `${formatNumber(s.acc, 1)}%`,
      },
      {
        key: 'duration',
        header: 'Duration',
        align: 'right',
        sortValue: (s) => s.durationSec,
        cell: (s) => formatDuration(s.durationSec),
      },
      {
        key: 'keystrokes',
        header: 'Keystrokes',
        align: 'right',
        sortValue: (s) => s.keystrokes,
        cell: (s) => formatNumber(s.keystrokes),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-[var(--text)]">Replay</h1>
      <Card className="p-0">
        <StateView
          loading={loading}
          error={error}
          empty={!data || data.length === 0}
          onRetry={retry}
          emptyTitle="No sessions in range"
          emptyHint="Pick a wider range or relax filters from the filter bar above."
          minHeight={240}
        >
          <SortableTable<SessionSummary>
            columns={columns}
            rows={data ?? []}
            rowKey={(s) => s.id}
            onRowClick={(s) => navigate(`/replay/${s.id}`)}
            emptyHint="No sessions match these filters."
            initialSort={{ key: 'date', dir: 'desc' }}
          />
        </StateView>
      </Card>
    </div>
  );
}

/* ============================================================================
 * Replay view (route /replay/:id)
 * ------------------------------------------------------------------------- */

function ReplayView({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const { data, loading, error, retry } = useReplay(sessionId);

  return (
    <div className="space-y-4">
      <ReplayTopBar onBack={() => navigate('/replay')} replay={data} />
      <StateView
        loading={loading}
        error={error}
        empty={!data}
        onRetry={retry}
        emptyTitle="Session not found"
        emptyHint="It may have been deleted — pick another from the list."
        minHeight={320}
      >
        {data ? data.keyEvents.length === 0 ? <HistoryNotice /> : <ReplayPlayer data={data} /> : null}
      </StateView>
    </div>
  );
}

function ReplayTopBar({ onBack, replay }: { onBack: () => void; replay: ReplayData | null }) {
  const r = replay?.result;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </Button>
      {replay && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--sub)]">
          <Badge tone="neutral">
            {replay.config.mode} {replay.config.mode2}
          </Badge>
          <Badge tone="neutral">{replay.config.language}</Badge>
          {!replay.completed && <Badge tone="error">incomplete</Badge>}
          {replay.flags.map((f) => (
            <Badge key={f} tone="sub">
              {f}
            </Badge>
          ))}
          {r && (
            <span className="tabular-nums text-[var(--text)]">
              {formatNumber(r.wpm, 2)} wpm · {formatNumber(r.rawWpm, 2)} raw · {formatNumber(r.acc, 2)}% acc · {formatNumber(r.consistency, 0)}% cons
            </span>
          )}
          <span aria-hidden>·</span>
          <span>{formatDateTime(replay.startedAt)}</span>
        </div>
      )}
    </div>
  );
}
/* ============================================================================
 * Player
 * ------------------------------------------------------------------------- */

type SpeedValue = '0.5' | '1' | '2' | '4';

function ReplayPlayer({ data }: { data: ReplayData }) {
  const durationMs = data.durationMs;

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // tRef mirrors `t` so the rAF loop reads/writes without re-subscribing each
  // frame. lastTsRef holds the previous frame timestamp for delta math.
  const tRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  // Reset state when the session changes (different session loaded).
  useEffect(() => {
    tRef.current = 0;
    setT(0);
    setPlaying(false);
  }, [data.sessionId]);

  // Animation loop — driven entirely by playing/speed/durationMs.
  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }
    let rafId = 0;
    const step = (ts: number) => {
      if (lastTsRef.current === null) {
        lastTsRef.current = ts;
      }
      const delta = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const next = tRef.current + delta * speed;
      if (next >= durationMs) {
        tRef.current = durationMs;
        setT(durationMs);
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setT(next);
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
      lastTsRef.current = null;
    };
  }, [playing, speed, durationMs]);

  const togglePlay = () => {
    // Restart from 0 if clicking Play after reaching the end.
    if (!playing && tRef.current >= durationMs) {
      tRef.current = 0;
      setT(0);
    }
    setPlaying((p) => !p);
  };

  // Rebuild the Monkeytype-like typed state at time t from InputEvents.
  const typedState = useMemo(
    () => typedStateAt(data.words, data.inputEvents, t),
    [data.words, data.inputEvents, t],
  );

  // Pre-pair key down/up events (sorted by downT) for the active-key lookup.
  const keyPairs = useMemo(() => buildKeyPairs(data.keyEvents), [data.keyEvents]);
  const activeCodes = useMemo(() => computeActiveCodes(keyPairs, t), [keyPairs, t]);

  return (
    <div className="space-y-4">
      {/* Monkeytype's result graph, which Monkeytype itself never saves */}
      <Card>
        <CardHeader title="Result graph" subtitle="wpm so far, raw speed per second and errors — rebuilt from your keystrokes" />
        {data.chart.seconds.length > 1 ? (
          <TestResultChart chart={data.chart} />
        ) : (
          <p className="py-4 text-center text-xs text-[var(--sub)]">This test is too short to draw a graph.</p>
        )}
      </Card>

      {/* Per-word burst speed */}
      <Card>
        <CardHeader title="Word speed" subtitle="Each word shaded by its burst speed — brighter is faster, red = had errors. Hover for details." />
        <BurstWords bursts={data.bursts} />
      </Card>

      {/* Typed text */}
      <Card>
        <CardHeader
          title="Typed text"
          subtitle={`${formatDuration(t / 1000)} / ${formatDuration(durationMs / 1000)}`}
        />
        <ReplayText state={typedState} />
      </Card>

      {/* Controls */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="md" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span>{playing ? 'Pause' : 'Play'}</span>
          </Button>
          <Segmented<SpeedValue>
            value={String(speed) as SpeedValue}
            ariaLabel="Playback speed"
            options={[
              { value: '0.5', label: '0.5×' },
              { value: '1', label: '1×' },
              { value: '2', label: '2×' },
              { value: '4', label: '4×' },
            ]}
            onChange={(v) => setSpeed(Number(v))}
          />
          <div className="min-w-[200px] flex-1">
            <input
              type="range"
              min={0}
              max={durationMs}
              step={10}
              value={t}
              onChange={(e) => {
                const v = Number(e.target.value);
                tRef.current = v;
                setT(v);
                setPlaying(false);
              }}
              className="w-full accent-[var(--main)]"
              aria-label="Replay scrubber"
            />
          </div>
          <div className="tabular-nums text-xs text-[var(--sub)]">
            {formatDuration(t / 1000)} / {formatDuration(durationMs / 1000)}
          </div>
        </div>
      </Card>

      {/* Per-second WPM strip with pause markers */}
      <Card>
        <CardHeader title="Per-second WPM" subtitle="Bars = wpm, red ticks = pauses" />
        <WpmStrip
          wpmPerSecond={data.wpmPerSecond}
          pauses={data.pauses}
          durationMs={durationMs}
          currentT={t}
        />
      </Card>

      {/* Live keyboard of currently-held keys */}
      <Card>
        <CardHeader title="Keys held" subtitle="Live preview of keys currently pressed at this moment in the replay" />
        <Keyboard activeCodes={activeCodes} className="mx-auto max-w-3xl" />
      </Card>
    </div>
  );
}

/* ============================================================================
 * Monkeytype-like text render with caret
 * ------------------------------------------------------------------------- */

function ReplayText({ state }: { state: TypedState }) {
  return (
    <div className="max-h-72 overflow-auto rounded-md bg-[var(--bg-dark)] p-4">
      <div className="flex flex-wrap font-mono text-lg leading-relaxed">
        {state.words.map((word, wi) => (
          <WordView
            key={wi}
            word={word}
            wi={wi}
            caretWi={state.caretWi}
            caretCi={state.caretCi}
          />
        ))}
      </div>
    </div>
  );
}

function WordView({
  word,
  wi,
  caretWi,
  caretCi,
}: {
  word: TypedState['words'][number];
  wi: number;
  caretWi: number;
  caretCi: number;
}) {
  const isCaretWord = wi === caretWi;
  const caretAtEnd = isCaretWord && caretCi >= word.perChar.length;
  return (
    <span className="inline-flex items-center">
      {word.perChar.map((ch, ci) => {
        const atCaret = isCaretWord && ci === caretCi;
        return (
          <span key={ci} className="inline-flex items-center">
            {atCaret && <Caret />}
            <Char ch={ch} />
          </span>
        );
      })}
      {caretAtEnd && <Caret />}
      <span aria-hidden>&nbsp;</span>
    </span>
  );
}

function Char({ ch }: { ch: { typed: string; expected: string; correct: boolean } }) {
  // Missing: not yet typed, show the expected char in sub color.
  if (ch.typed === '' && ch.expected !== '') {
    return <span className="text-[var(--sub)]">{ch.expected}</span>;
  }
  // Extra: typed with no expected slot — error + underline.
  if (ch.typed !== '' && ch.expected === '') {
    return <span className="text-[var(--error)] underline">{ch.typed}</span>;
  }
  // Incorrect: show the typed (wrong) char in error color.
  if (ch.typed !== '' && !ch.correct) {
    return <span className="text-[var(--error)]">{ch.typed}</span>;
  }
  // Correct: show the typed char in default text color.
  if (ch.typed !== '') {
    return <span className="text-[var(--text)]">{ch.typed}</span>;
  }
  // Both empty — defensive fallback (typedStateAt never produces this).
  return <span aria-hidden>&nbsp;</span>;
}

function Caret() {
  return (
    <span
      aria-hidden
      className="mr-[-2px] inline-block h-[1.1em] w-[2px] translate-y-[0.08em] animate-pulse bg-[var(--main)]"
    />
  );
}

/* ============================================================================
 * Per-second WPM strip + pause markers (custom inline SVG)
 * ------------------------------------------------------------------------- */

function WpmStrip({
  wpmPerSecond,
  pauses,
  durationMs,
  currentT,
}: {
  wpmPerSecond: number[];
  pauses: Array<[number, number]>;
  durationMs: number;
  currentT: number;
}) {
  const W = 800;
  const H = 60;
  const PAD_Y = 2;

  if (wpmPerSecond.length === 0) {
    return <p className="py-4 text-center text-xs text-[var(--sub)]">No WPM data for this session.</p>;
  }

  const n = wpmPerSecond.length;
  const barW = Math.max(2, Math.floor(W / n));
  const totalW = barW * n;
  const maxWpm = Math.max(1, ...wpmPerSecond);
  const currentSec = currentT / 1000;
  const playheadX = currentSec * barW;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalW} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="block"
        role="img"
        aria-label="Per-second WPM chart with pause markers"
      >
        {/* baseline */}
        <line x1={0} y1={H - PAD_Y} x2={totalW} y2={H - PAD_Y} stroke="var(--sub-2)" strokeWidth={1} />
        {/* per-second bars — brighter once "played through" */}
        {wpmPerSecond.map((wpm, i) => {
          const h = Math.round((wpm / maxWpm) * (H - PAD_Y * 2));
          const x = i * barW;
          const y = H - PAD_Y - h;
          const played = i + 1 <= currentSec;
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={y}
              width={Math.max(1, barW - 1)}
              height={h}
              fill="var(--main)"
              opacity={played ? 1 : 0.35}
            >
              <title>{`sec ${i} — ${formatNumber(wpm, 0)} wpm`}</title>
            </rect>
          );
        })}
        {/* pause markers — red vertical tick at the second a pause begins */}
        {pauses.map(([startMs], i) => {
          const sec = Math.floor(startMs / 1000);
          if (sec < 0 || sec >= n) return null;
          const x = sec * barW + barW / 2;
          return (
            <line
              key={`p${i}`}
              x1={x}
              y1={0}
              x2={x}
              y2={H}
              stroke="var(--error)"
              strokeWidth={1.5}
            >
              <title>{`pause at ${formatDuration(startMs / 1000)}`}</title>
            </line>
          );
        })}
        {/* playhead */}
        <line
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={H}
          stroke="var(--text)"
          strokeWidth={1}
          opacity={0.45}
        />
      </svg>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--sub)]">
        <span>
          0s — {formatDuration(durationMs / 1000)} ({n} samples)
        </span>
        <span>peak {formatNumber(Math.max(...wpmPerSecond), 0)} wpm</span>
      </div>
    </div>
  );
}

/* ============================================================================
 * Held-key computation — pairs key down/up events and finds the set of codes
 * whose "hold window" contains the current time.
 * ------------------------------------------------------------------------- */

interface KeyPair {
  code: string;
  downT: number;
  upT: number; // +Infinity if never released (key still held at session end)
}

function buildKeyPairs(keyEvents: KeyEvent[]): KeyPair[] {
  const pending = new Map<string, number[]>(); // code -> stack of down times
  const pairs: KeyPair[] = [];
  for (const ev of keyEvents) {
    let stack = pending.get(ev.code);
    if (!stack) {
      stack = [];
      pending.set(ev.code, stack);
    }
    if (ev.type === 'down') {
      stack.push(ev.t);
    } else {
      const downT = stack.shift();
      if (downT === undefined) continue; // orphan up — ignore
      pairs.push({ code: ev.code, downT, upT: ev.t });
    }
  }
  // Keys still held at end of session (no matching up event).
  for (const [code, downs] of pending) {
    for (const downT of downs) {
      pairs.push({ code, downT, upT: Number.POSITIVE_INFINITY });
    }
  }
  // Sort by downT so computeActiveCodes can short-circuit.
  pairs.sort((a, b) => a.downT - b.downT);
  return pairs;
}

function computeActiveCodes(pairs: KeyPair[], currentT: number): Set<string> {
  const out = new Set<string>();
  for (const p of pairs) {
    if (p.downT > currentT) break; // sorted by downT → no more active pairs
    if (p.downT <= currentT && currentT < p.upT) {
      out.add(p.code);
    }
  }
  return out;
}

/* ============================================================================
 * Burst heatmap of the words (like Monkeytype's words history with burst heatmap)
 * ------------------------------------------------------------------------- */

function BurstWords({ bursts }: { bursts: WordBurst[] }) {
  if (bursts.length === 0) return <p className="py-4 text-center text-xs text-[var(--sub)]">No finished words in this test.</p>;
  const speeds = bursts.map((b) => b.wpm).sort((a, b) => a - b);
  const lo = speeds[Math.floor(speeds.length * 0.1)] ?? 0;
  const hi = speeds[Math.floor(speeds.length * 0.9)] ?? 1;
  const median = speeds[Math.floor(speeds.length / 2)] ?? 0;
  const slowest = [...bursts].sort((a, b) => a.wpm - b.wpm).slice(0, 5);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-base leading-relaxed">
        {bursts.map((b) => {
          const k = hi > lo ? Math.min(1, Math.max(0, (b.wpm - lo) / (hi - lo))) : 1;
          const wrong = b.typed !== b.word;
          return (
            <span
              key={`${b.wi}-${b.endMs}`}
              title={`${b.word}${wrong ? ` (typed "${b.typed}")` : ''} — ${formatNumber(b.wpm, 0)} wpm${b.errors ? `, ${b.errors} error${b.errors > 1 ? 's' : ''}` : ''}`}
              className={wrong || b.errors ? 'text-[var(--error)] underline decoration-dotted' : 'text-[var(--text)]'}
              style={{ opacity: 0.3 + 0.7 * k }}
            >
              {b.word}
            </span>
          );
        })}
      </div>
      <p className="text-xs text-[var(--sub)]">
        median {formatNumber(median, 0)} wpm · slowest:{' '}
        {slowest.map((b, i) => (
          <span key={`${b.wi}-s`} className="text-[var(--text)]">
            {i > 0 ? ', ' : ''}
            {b.word} ({formatNumber(b.wpm, 0)})
          </span>
        ))}
      </p>
    </div>
  );
}
/** Tests imported from Monkeytype's export carry only the result numbers. */
function HistoryNotice() {
  return (
    <Card>
      <CardHeader title="No keystrokes for this test" subtitle="Imported from Monkeytype's results export" />
      <p className="text-sm text-[var(--sub)]">
        Monkeytype only kept this test's result numbers (shown above), so there is no replay, result graph or word speed for
        it. It still counts in your speed and accuracy history, trends and streaks. Tests recorded by the TypeLens extension
        have everything.
      </p>
    </Card>
  );
}