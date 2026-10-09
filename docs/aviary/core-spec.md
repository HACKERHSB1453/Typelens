# typelens-core — build spec (for the Aviary flock)

Pure TypeScript package `@typelens/core`. **No DOM, no Node-only APIs, no runtime dependencies.** ESM. Tests with Vitest.
The contract is `src/schema.ts` (already written, do NOT change it). Import types from `./schema`.
Every function is PURE and deterministic (no Date.now(), no Math.random() — take `now`/`rng` as parameters).

## Files to create (one task each, in this order)
1. `src/layout.ts`
2. `src/stats-util.ts`   (median, percentile, mean, stdDev, kogasa, histogram, seeded PRNG `mulberry32`)
3. `src/monkeytype.ts`   (Monkeytype-compatible formulas + cross-check)
4. `src/derive.ts`       (`deriveKeystrokes`)
5. `src/analyze.ts`      (`analyze`)
6. `src/progress.ts`     (`buildProgress`)
7. `src/replay.ts`       (`buildReplay`)
8. `src/practice.ts`     (`generatePractice`)
9. `src/export.ts`       (`sessionsToCsv`, `keystrokesToCsv`, `parseImport`)
10. `src/fixtures.ts`    (`makeSession` synthetic session builder used by tests)
11. `src/index.ts`       re-export everything
12. `test/*.test.ts`     one test file per module above

## 1. layout.ts — US QWERTY
Export `KEYS: Record<string, {char: string; shiftChar: string; finger: FingerId; hand: Hand; row: Row}>` keyed by KeyboardEvent.code, plus `keyInfo(code)`, `fingerOf(code)`, `handOf(code)`, `rowOf(code)`, `codeForChar(ch)` (inverse map, letters lower-case), `isModifier(code)` (Shift*/Control*/Alt*/Meta*/CapsLock).
Fingers: LP: Backquote Digit1 KeyQ KeyA KeyZ · LR: Digit2 KeyW KeyS KeyX · LM: Digit3 KeyE KeyD KeyC · LI: Digit4 Digit5 KeyR KeyT KeyF KeyG KeyV KeyB · RI: Digit6 Digit7 KeyY KeyU KeyH KeyJ KeyN KeyM · RM: Digit8 KeyI KeyK Comma · RR: Digit9 KeyO KeyL Period · RP: Digit0 Minus Equal KeyP BracketLeft BracketRight Backslash Semicolon Quote Slash Enter · Space: RT (right thumb).
Rows: number = Backquote..Equal; top = Q..BracketRight + Backslash; home = A..Quote; bottom = Z..Slash; space = Space.
Displayed `char` for Space is "␣".

## 2. stats-util.ts
`median(xs)`, `percentile(xs, p)`, `mean`, `stdDev` (population), `kogasa(cov) = 100*(1 - tanh(cov + cov^3/3 + cov^5/5))`, `histogram(values, binMs, maxMs) -> {binMs, counts}` (last bin collects overflow), `mulberry32(seed) -> () => number in [0,1)`. Empty input → 0 (never NaN/Infinity).

## 3. monkeytype.ts — formulas (match monkeytype.com)
- `wpm(correctWordChars, correctSpaces, seconds) = ((correctWordChars + correctSpaces) * 60 / seconds) / 5`
- `rawWpm(allCorrectChars, spaces, incorrect, extra, seconds) = ((sum) * 60 / seconds) / 5`
- `accuracy(correct, incorrect) = 100 * correct / (correct + incorrect)`, 100 when nothing typed. Counted PER KEYSTROKE (a corrected mistake still counts as incorrect).
- `consistency(rawPerSecond) = kogasa(stdDev(x)/mean(x))`.
- `crossCheck(session, derivedWpm, derivedAcc) -> {ok: boolean; wpmDiff; accDiff}`: ok when |wpm diff| <= max(2, 3% of Monkeytype's wpm) and |acc diff| <= 1.5 points. Returns ok:true when `session.result` is missing.

## 4. derive.ts — `deriveKeystrokes(session: Session, opts?: {pauseMs?: number}): Keystroke[]`  (pauseMs default 2000)
1. Match key events: iterate `keyEvents` in order; a `down` opens an entry in a per-`code` queue; an `up` closes the oldest open entry of that code → `holdMs = up.t - down.t`. Ignore modifier codes for keystroke rows.
2. Walk `inputEvents` in order. Each `op:'ins'` becomes one Keystroke (`typed`, `expected`, `correct` from the event). Each `op:'commit'` becomes a Keystroke with `typed = ' '`, `expected = ' '`, `code = 'Space'`, `correct = true` when the word was completed (ci >= target word length) else false.
3. `down` lookup: the key `down` event with the same `code` and `t` equal (±0.5 ms) to the input event's `t`. If none found, holdMs/flightMs = null.
4. `ikiMs` = this.t - previous keystroke.t; null for the first keystroke, and null when the gap > pauseMs (a pause, not a transition).
5. `flightMs` = this down.t - previous keystroke's up.t (null if unknown). `rollover = flightMs !== null && flightMs < 0`.
6. `corrected`: an `ins` with `correct:false` whose (wi, ci) is later removed by a `del` (same wi, ci = that index) or a `wdel` on that word before the word is committed.
7. `prev`: the previous typed char in the same word without a delete in between, else null.
8. `finger/hand/row` from layout by `code`.
9. Sessions with flag `'ime'` → return [] (timing not trustworthy).
Edge cases to test: rollover (down before previous up), missing keyup, backspace correction, wdel, commit of an incomplete word, pause > pauseMs, empty session.

## 5. analyze.ts — `analyze(sessions: Session[], filters?: AnalysisFilters, now?: number): Analysis`
- Filter sessions: by `from/to` (startedAt), `modes`, `languages`, `practiceOnly`, and `excludeFlagged` (default true: drop sessions flagged `ime` or `captureUnreliable`).
- Derive keystrokes per session; `minSamples` default 5 (drop keys/grams/words with fewer samples).
- **keys**: group by `code`. `errorRate` = incorrect/count. `medianIkiMs`/`medianHoldMs` over non-null values. `confusions`: for keystrokes whose `expected` is this key's char and `typed` differs, count `typed` → top 5. (Key of a confusion row is the EXPECTED key.)
- **n-grams** (`bigrams`, `trigrams`): a gram is a run of 2 or 3 consecutive keystrokes in the same word with NO delete between them, identified by the EXPECTED chars (e.g. "th"). With `includeSpaceNgrams` the run may cross a commit (space is "␣"). `medianMs` = median of (last.t - first.t). `errorRate` = share of occurrences where the LAST keystroke is incorrect. `expectedMs` = sum of the user's own per-key median IKI for the gram's chars after the first (bigram → median IKI of char 2; trigram → char 2 + char 3). `costMs = medianMs - expectedMs`. Sort by `costMs` desc. Skip grams containing a pause (any ikiMs null after the first).
- **words**: one attempt per committed word. `medianWpm` = median over attempts of (word length + 1) * 60 / (commit.t - previous commit.t or first keystroke of the word) / 5 (skip attempts with a pause). `errorRate` = share of attempts with any incorrect keystroke; `correctedRate` = share with any `corrected` keystroke. Sort by errorRate desc then medianWpm asc.
- **fingers / hands / rows**: group by finger/hand/row; `rolloverRate` = rollover keystrokes / count.
- `sameFingerBigram`: consecutive keystrokes using the same finger but different keys: `{count, medianMs, errorRate}`. `handAlternation`: median gap when consecutive keys use different hands vs the same hand.
- `overall`: wpm/rawWpm/acc/consistency using the formulas in monkeytype.ts, aggregated across sessions (duration-weighted for consistency); medians of ikiMs/holdMs; `rolloverRate`; `pauseRate` = intervals > pauseMs / all intervals.
- `ikiHistogram`: histogram of ikiMs with binMs = 20 up to 1000 ms.
- `minutes` = sum of session durations / 60000; `keystrokes` = count; `range` = min/max startedAt.

## 6. progress.ts — `buildProgress(sessions, filters?, now?): ProgressSeries`
Group by LOCAL calendar date (YYYY-MM-DD). `avgWpm/avgAcc/avgConsistency` = duration-weighted means of session values (use `result` when present, else derived). `currentStreakDays` = consecutive days with ≥1 session ending on the date of `now` (0 if none today or yesterday... define: streak counts back from today; if today has none but yesterday has, count from yesterday). `longestStreakDays` over all data. `improved`/`regressed`: compare each gram's median transition ms in the earliest third vs the latest third of the filtered date range (grams need ≥ minSamples in BOTH); `deltaMs = lastMs - firstMs`; improved = most negative first (max 10), regressed = most positive first (max 10).

## 7. replay.ts — `buildReplay(session): ReplayData`
Copy words/config/events; `durationMs` = last event t; `wpmPerSecond[i]` = (chars typed in second i) * 60 / 5 (correct chars only); `pauses` = list of [startMs, endMs] where gap between consecutive keydowns > 2000.

## 8. practice.ts — `generatePractice(req: PracticeRequest, analysis: Analysis, wordList: string[], opts: {rng: () => number; now: number}): PracticeResult`
1. Focus items: `auto` → the top 12 by weight from analysis.bigrams + analysis.trigrams (+ top 4 keys, as single characters); `grams`/`keys`/`fingers` → use the request (keys → their char; fingers → all keys of those fingers, weight by that finger's slowness).
2. Weight: accuracy → `errorRate * ln(1+count)`; speed → `max(costMs,0) * ln(1+count)`; balanced → 0.5 * each after normalising to 0..1 per list. Drop items with weight 0.
3. Word score = Σ over focus items (weight × occurrences of the gram/char in the word) / sqrt(word length). Words with score 0 are only used as filler when fewer than `length` scored words exist.
4. If `hand` is 'L' or 'R': keep words whose letters all belong to that hand's keys; if fewer than length/4 remain, relax to words with ≥70% letters on that hand.
5. Sample `length` words without replacement using weights (score) and `rng`; never place the same word twice in a row; no focus item may account for more than 40% of the picks.
6. Return `text` (space-separated), `words`, `focus` (labels), `coverage` (label → number of words containing it), `generatedAt: now`.
Word list is passed in (an array of lowercase words) — do not hard-code one here.

## 9. export.ts
`sessionsToCsv(sessions: Session[]): string` (one row per session: id, startedAt ISO, mode, mode2, language, punctuation, numbers, wpm, rawWpm, acc, consistency, durationSec, keystrokes, completed, flags joined by |), `keystrokesToCsv(sessions): string` (one row per Keystroke, all fields), `parseImport(json: unknown): {sessions: Session[]; errors: string[]}` (accept `{v:1, sessions: Session[]}` or a bare array; validate every field of each session by hand — no schema library; drop invalid sessions with an error message). CSV: RFC 4180 quoting.

## 10. fixtures.ts — `makeSession(opts): Session`
Deterministic builder: `text` (words joined by space), `msPerKey` (default 150), `holdMs` (default 90), optional `errors: Array<{wi, ci, typed}>` (wrong char typed then corrected with a backspace), `rollover: boolean` (make keydown overlap previous keyup), `startedAt`, `id`. Emits consistent keyEvents + inputEvents (ins/del/commit) so `deriveKeystrokes` results are predictable.

## Conventions
TypeScript strict, `noUncheckedIndexedAccess` on. Named exports only. No `any`. Small functions. Every exported function has a Vitest test with hand-computed expected values (state the arithmetic in a comment). Never divide by zero; never return NaN.
