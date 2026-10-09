# @typelens/web

The TypeLens dashboard: the React and Vite user interface that shows the analysis. It is the same code in two places:

- **In the desktop app** (`apps/desktop`), it is the window the user sees. The app serves the built dashboard from
  `app://typelens/`, and the desktop preload gives it its host (storage, dialogs, updates).
- **In a browser**, for development, it runs at `http://localhost:5173`. The host is then built in the page (IndexedDB,
  localStorage, and the browser extension through a page bridge).

The dashboard never talks to Electron or `chrome.*` directly.

## Host abstraction

All host access goes through `TypeLensHost`, the interface in `packages/host-contract`:

- `src/host/current.ts`: `getHost()` returns `window.typelensHost` when the desktop preload installed it, and otherwise
  `createWebHost()`. Components never check which platform they run on. They read `host.capabilities` instead.
- `src/host/webHost.ts`: the browser implementation (IndexedDB `typelens-web`, localStorage, file input and download, and
  the extension bridge in `src/data/bridge.ts`).
- `src/host/hooks.ts`: React hooks for extension status, update state and menu navigation.

## Data layer

- `src/data/index.ts`: the entry point for screens. It chooses between the user's real sessions and generated demo
  sessions (the preference is `auto`, `demo` or `mine`).
- `src/data/LocalDataSource.ts`: the real data source. It runs every statistic through `@typelens/core`, so nothing is
  computed differently in the two places.
- `src/data/demo.ts`: seeded demo sessions, shown with a label while there are no real tests.

## Pages

Overview, Keys, Ngrams, Words, Fingers, Replay, Progress, Practice, Data and NotFound, in `src/pages/`. Shared components
are in `src/components/` (`ui`, `charts`, `keyboard`, `layout`, `host`). Colours are CSS variables in `src/index.css`.

## Scripts

Run these from the repository root with `-w @typelens/web`, or from this folder:

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite development server on `http://localhost:5173` (strict port, localhost only). |
| `npm run build` | Type-checks (`tsc -b`) and builds `dist/`. The desktop build copies `dist/` into the app. |
| `npm run preview` | Serves the production build on port 5173. |
| `npm run typecheck` | `tsc --noEmit`. |

Tests live in `apps/web/test/` and run with the root `npm test`.

For the whole desktop app with hot reload, run `npm run dev:desktop` from the repository root.

## Stack

React 18, TypeScript (strict), Vite 5, Tailwind CSS, react-router, Chart.js (react-chartjs-2), date-fns, lucide-react. The
Hack font is bundled from the `hack-font` package.
