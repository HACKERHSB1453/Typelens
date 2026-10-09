# Contributing to TypeLens

Thanks for your interest in TypeLens. This guide explains how to set up the project, what checks a change must pass,
and how the code is organised. By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug** with the bug report form. Include your TypeLens version, operating system, browser and the
  steps to reproduce.
- **Suggest a feature** with the feature request form. Describe the problem you want solved before the solution.
- **Fix something** from the issue list. For anything larger than a small fix, please open an issue first so we can
  agree on the approach.
- **Improve the docs.** Typos and unclear steps are welcome as small pull requests.

Security problems must not be reported in public. See [SECURITY.md](SECURITY.md).

## Development setup

Requirements:

- Node.js 22 (the CI uses Node 22 on Ubuntu and Windows)
- npm (ships with Node)
- Google Chrome, Edge or Brave, to test the extension

```bash
git clone https://github.com/HACKERHSB1453/Typelens.git
cd typelens
npm ci
```

The repository is an npm workspace with five packages:

| Workspace | Path | Purpose |
| --- | --- | --- |
| `@typelens/core` | `packages/core` | Analysis engine and data contract (pure TypeScript, no browser or Electron APIs) |
| `@typelens/host-contract` | `packages/host-contract` | Types only: the `TypeLensHost` interface between the dashboard and its host |
| `@typelens/extension` | `apps/extension` | Chrome MV3 extension: recorder, local store, popup, page bridge |
| `@typelens/web` | `apps/web` | React and Vite dashboard |
| `@typelens/desktop` | `apps/desktop` | Electron shell: window, sync endpoint on 127.0.0.1, inbox, auto-update |

## Common scripts

Run these from the repository root:

| Command | What it does |
| --- | --- |
| `npm ci` | Installs all workspaces from the lock file. Use this, not `npm install`, for a clean setup. |
| `npm test` | Runs all unit tests (core, extension, desktop, and the web-to-extension sync tests). |
| `npm run typecheck` | Strict TypeScript check across the workspaces. |
| `npm run build` | Builds the extension and the dashboard. |
| `npm run start:desktop` | Runs the desktop app from source. |
| `npm run dist:win` / `npm run dist:linux` | Builds installers into `apps/desktop/release`. |

For the dashboard alone, `npm run dev -w @typelens/web` starts the Vite development server. For the extension alone,
`npm run build -w @typelens/extension` writes `apps/extension/dist`, which you load unpacked in Chrome
(`chrome://extensions`, Developer mode, Load unpacked).

## Code style

- **TypeScript in strict mode.** The base configuration (`tsconfig.base.json`) enables `strict` and
  `noUncheckedIndexedAccess`. Do not use `any`; use `unknown` and narrow it. Do not silence errors with `@ts-ignore`
  unless you explain why in a comment.
- **Formatting** follows `.editorconfig`: UTF-8, LF line endings, two-space indentation, final newline. Keep the style
  of the file you are editing.
- **Comments** explain why something is done, not what the code plainly says. Module headers should state the
  purpose and any security or data-integrity constraint.
- **Colours** in the dashboard live only in `apps/web/src/index.css` as CSS variables. Do not add ad-hoc hex values
  to components.
- **Monkeytype DOM selectors** live only in `apps/extension/src/selectors.ts`, because Monkeytype changes its page
  structure from time to time.
- **No new runtime dependencies** without a reason. Explain the reason in the pull request.

## Tests

- Logic in `packages/core` must have tests in `packages/core/test/`. A change to an analysis formula, the data
  contract or an import/export format needs a test that would fail without it.
- Changes in `apps/extension` need tests in `apps/extension/test/`. Recording code is tested against fake Monkeytype
  pages (the DOM is simulated with jsdom).
- Changes that cross the extension and dashboard boundary (sync, bridge) belong in `apps/web/test/`.
- Changes to the desktop app (sync endpoint, inbox, session store, IPC validation, updater) belong in
  `apps/desktop/test/`.
- Tests must be deterministic. The demo data uses a seeded random generator for this reason.

Run `npm test` and `npm run typecheck` before you open a pull request. The CI runs both on Ubuntu and Windows.

## Where things live

- **Data contract:** `packages/core/src/schema.ts`. Changing a `Session` field is a breaking change: bump
  `SCHEMA_VERSION` and describe the migration in the changelog.
- **Analysis:** `packages/core/src/` (`derive.ts`, `analyze.ts`, `ngrams.ts`, `progress.ts`, `replay.ts`, `practice.ts`).
- **Import and export:** `packages/core/src/export.ts` (JSON and CSV) and `packages/core/src/history.ts` (Monkeytype
  results CSV).
- **Desktop push protocol:** `packages/core/src/desktop.ts`. Bump `DESKTOP_API` only for incompatible endpoint changes.
- **Recorder:** `apps/extension/src/content/capture.ts`, with selectors in `selectors.ts`.
- **Desktop app:** `apps/desktop/src/` (sync endpoint in `server.ts`, IPC in `main.ts` and `channels.ts`, argument checks in
  `ipc.ts`). Every IPC argument must be validated there, because the renderer is treated as untrusted.
- **Host contract:** `packages/host-contract/src/index.ts`. Adding a method means implementing it in both
  `apps/desktop/src/preload.ts` and `apps/web/src/host/webHost.ts`.
- **Dashboard screens:** `apps/web/src/pages/`. The dashboard reads data only through its data layer in
  `apps/web/src/data/`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture.

## Commits and pull requests

- Use short, imperative commit subjects in the style `type: summary`, for example `fix: keep replay caret on backspace`.
  Common types are `feat`, `fix`, `docs`, `test`, `refactor`, `build` and `ci`.
- Keep each pull request focused on one change. Separate refactors from behaviour changes.
- Fill in the pull request template. Describe what changed, why, and how you tested it.
- If you change user-visible behaviour, add a line under `## [Unreleased]` in `CHANGELOG.md`.
- Do not commit generated output (`dist/`, `release/`, `node_modules/`) or any keys or certificates.
- Maintainers squash or rebase as needed. Do not force-push to a branch someone else is reviewing.

## Licensing of contributions

TypeLens is released under the MIT License. By submitting a contribution you agree that it may be distributed under
that license. Do not submit code copied from Monkeytype or from any other project unless its license is compatible
with MIT and the source is credited. TypeLens reimplements formulas in its own code; do not copy Monkeytype's source.
