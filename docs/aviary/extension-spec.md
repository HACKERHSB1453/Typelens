# typelens-extension — build spec (for the Aviary flock)

Chrome Manifest V3 extension, TypeScript, built with Vite. It PASSIVELY records Monkeytype tests as `Session` objects
(`../../packages/core/src/schema.ts`, do NOT change it) into IndexedDB, and hands them to the TypeLens web app through a bridge.

## Hard rules (privacy + fair play)
1. **Passive only.** Listeners are `addEventListener(type, fn, {capture: true, passive: true})`. NEVER call `preventDefault`,
   `stopPropagation`, `stopImmediatePropagation`. NEVER modify monkeytype.com's DOM, storage or network. NEVER send anything to monkeytype.com.
2. **Record only typing-test input.** Ignore any event whose target is not the element `#wordsInput` (login box, search,
   command line, custom-text box, settings inputs must never be recorded). Ignore `event.repeat`. Ignore events while `isComposing`.
3. **Zero network.** No fetch/XHR/WebSocket anywhere in the extension. No telemetry. Data leaves the extension only via the bridge (rule below).
4. **Minimal permissions**: `storage`, `unlimitedStorage`; host permission `https://monkeytype.com/*` only. Content script for the web app
   matches ONLY the origins listed in `bridge-origins.ts` (default `http://localhost:5173/*`, `http://127.0.0.1:5173/*`). No `<all_urls>`, no `tabs`, no `scripting`.

## Monkeytype DOM facts (verified on the live site, 2026-09-20)
- `textarea#wordsInput` receives typing (hidden). `#words` contains `div.word[data-wordindex="N"]`, each with `<letter>` children
  (one per target character; classes `correct`, `incorrect`, `extra` are added as you type; `.word.active` is the current word;
  `.word.typed` are finished words; `.word.error` contains a mistake). ~100 words are rendered at once.
- `#result` has class `hidden` while a test is running and loses it when the result screen is shown.
- Test config lives in `localStorage["config"]` (JSON): `mode` ("time"|"words"|"quote"|"zen"|"custom"), `time`, `words`, `quoteLength`,
  `punctuation`, `numbers`, `language`, `funbox` (array), `difficulty`.
- Monkeytype's frontend is being migrated to SolidJS, so ALL selectors live in ONE file `src/selectors.ts` with a `healthCheck(doc)`
  that reports which selectors currently match. The popup shows a warning when any is missing.

## Architecture
```
src/selectors.ts        constants + healthCheck(document)
src/recorder.ts         PURE state machine (no DOM, no chrome.*): the logic under test
src/content/capture.ts  thin DOM glue on monkeytype.com: forwards events to the recorder, sends finished Sessions to the background
src/content/bridge.ts   content script on the web-app origin(s): window.postMessage <-> chrome.runtime
src/background.ts       service worker: IndexedDB store, sync protocol, settings, badge
src/db.ts               tiny IndexedDB wrapper (object store "sessions" keyPath "id", index "startedAt"), no libraries
src/popup/*             popup UI: pause toggle, session count, last test summary (wpm/acc/keystrokes), selector health warning, "Export JSON", "Open dashboard"
src/bridge-origins.ts   allowed web-app origins (single source of truth, also read by the manifest generator)
manifest.config.ts      manifest built from bridge-origins.ts
```

## recorder.ts — pure logic (the important part; needs thorough tests)
```ts
class Recorder {
  constructor(deps: { now(): number /* epoch ms */; uuid(): string; extVersion: string });
  onTestConfig(cfg: SessionConfig): void;
  onWords(words: string[]): void;                       // target words (from the DOM); may be called repeatedly as the buffer grows
  onKeyDown(e: {code: string; key: string; t: number; repeat: boolean; isComposing: boolean}): void;   // t = event.timeStamp (ms, high-res)
  onKeyUp(e: {code: string; key: string; t: number}): void;
  onInput(e: {inputType: string; data: string | null; isComposing: boolean; t: number}, ctx: {wi: number; ci: number; expectedChar: string}): void;
  onRestart(): void;                                    // discards the in-progress session (flag 'restart' only if it had >= 5 inputs, then it is stored with completed:false)
  onBlur(): void;                                       // adds flag 'blur'
  onResult(r: MonkeytypeResult, derivedCheck?: {ok: boolean}): Session | null;   // finalises, sets completed:true, returns the Session
  snapshot(): {active: boolean; inputs: number};
}
```
Rules:
- The session starts at the first accepted `ins` input; `t=0` is that keydown's timestamp; all stored `t` are `(e.t - t0)` rounded to 0.1 ms.
- Keep `keyEvents` for printable keys, Space, Backspace and Enter only (drop modifier keys, arrows, function keys). Match `keyup` to the earlier `keydown` by `code`.
- `inputType` mapping: `insertText` with 1 char → `{op:'ins', typed, expected: ctx.expectedChar, correct: typed===expected, code}`; a space in `insertText` (data " ") → `{op:'commit'}`;
  `deleteContentBackward` → `{op:'del'}`; `deleteWordBackward` → `{op:'wdel'}`. Anything else with `isComposing` → set flag `'ime'` and ignore the event.
- `expectedChar` beyond the word length is `""` (an extra character).
- A single test's `Session.id` is `uuid()` generated at session start.
- Ignore inputs until `onWords` and `onTestConfig` were called (drop with no crash).
- Sessions with fewer than 5 inputs are dropped, not stored.

## content/capture.ts — DOM glue on monkeytype.com
- `run_at: document_idle`; wait until `#wordsInput` exists (MutationObserver on `document.documentElement`, disconnect once found — Monkeytype is a SPA, so re-attach if the element is replaced).
- Register capture-phase passive listeners on `document` for `keydown`, `keyup`, `input`, and `blur` on `window`. For each: return immediately unless `event.target` is `#wordsInput`.
- On the FIRST `keydown` of a new test also read `localStorage.config` → `onTestConfig` (mode2: time → String(config.time), words → String(config.words), quote → String(config.quoteLength)).
- Read target words from `#words .word` (each word = concatenation of its `<letter>` textContent excluding letters with class `extra`) on test start and whenever `#words` childList changes (MutationObserver, debounced 250 ms) → `onWords`.
- For an `input` event compute the context from the DOM: `.word.active` → `wi = Number(dataset.wordindex)`; `ci` = value length change context (typed length of the active word BEFORE this edit: count of its `<letter>` elements that have class correct/incorrect/extra); `expectedChar` = the `<letter>` at index `ci` that is not `extra` (textContent), or "" if beyond.
- Restart detection: `#words` re-rendered with `data-wordindex="0"` becoming `.active` while a session is active with ≥1 input → `onRestart()`.
- Result detection: MutationObserver on `#result` `class` attribute; when `hidden` disappears → parse the result screen for wpm / raw / acc / consistency / time (selectors in `selectors.ts`; numbers parse with `parseFloat`, strip `%`), call `onResult`, then `chrome.runtime.sendMessage({type:'session', session})`.
- Never throw into the page: wrap every listener body in try/catch and swallow errors (log to console.debug only).
- Pause toggle: read `chrome.storage.local.get('paused')`; when paused, do nothing.

## background.ts + db.ts
- `{type:'session'}` → `db.put(session)`; update `chrome.storage.local` summary `{count, last: {wpm, acc, at}}`; set badge text to the count of un-synced sessions (empty when 0).
- Sync protocol (called by the bridge): `{type:'sync:ping'}` → `{ok:true, version}`; `{type:'sync:list', after?: number}` → `{ids: string[]}` (ids of sessions with startedAt > after, ascending);
  `{type:'sync:get', ids: string[]}` → `{sessions: Session[]}` (max 20 ids per call); `{type:'sync:ack', ids: string[]}` → marks them `synced:true` (data is KEPT; only the user can delete).
- `{type:'export'}` → all sessions as `{v:1, sessions:[...]}` JSON string. `{type:'clear'}` requires `{confirm:'DELETE'}`.

## content/bridge.ts — web-app side
Runs only on `bridge-origins.ts` origins. Listen to `window.addEventListener('message')`; accept only `event.source === window` and `event.origin === location.origin` and `data.channel === 'typelens'`.
Requests `{channel:'typelens', id, action: 'ping'|'list'|'get'|'ack', payload}` → forward to background → reply `window.postMessage({channel:'typelens', id, reply:true, ok, data}, location.origin)`.
The web app never gets direct access to `chrome.*`; only these four actions exist.

## Popup
Small HTML/TS page (no framework): toggle "Recording" (writes `paused`), counters, last test line, red banner if `healthCheck` reports missing selectors (content script stores the last health result in `chrome.storage.session`), buttons "Export JSON" (downloads via a Blob URL) and "Open dashboard" (opens `http://localhost:5173` — configurable constant).

## Tests (Vitest + jsdom)
- `recorder.test.ts`: feed a scripted event sequence (with a rollover, a mistake + backspace, a word delete, a space commit, an extra character, an IME event, a restart) and assert the emitted Session's `keyEvents`, `inputEvents` and flags exactly.
- `capture.test.ts` (jsdom): build a fake Monkeytype DOM (`#wordsInput`, `#words` with `.word`/`<letter>`, `#result.hidden`) and assert: events from other inputs are ignored; a full simulated test yields a stored Session; nothing is ever `preventDefault`ed; `healthCheck` reports a removed selector.
- `db.test.ts` (fake-indexeddb): put/list/ack/clear.
- `bridge.test.ts`: rejects messages from other origins/sources; forwards the four actions.

## Conventions
TypeScript strict, ESM, no `any`, no runtime dependencies except dev tooling. Keep each file under ~250 lines. Comment WHY, not what.
