# Changelog

All notable changes to TypeLens are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **TypeLens without the desktop app.** The extension now contains the whole dashboard. Click **Open dashboard** in
  the toolbar popup: every page works, new tests appear as soon as you finish them, and import and export work as in
  the app. The desktop app is optional; when it runs, it still receives every test.
- **Firefox.** A Firefox build of the extension (Firefox 128+), shipped as `TypeLens-extension-firefox-<version>.zip`,
  in the app's `extension-firefox` folder, and as a signed `.xpi` when the release is signed by Mozilla. The popup
  asks for site access when Firefox installed the extension without it.
- **Arch Linux.** Releases include `TypeLens-<version>-x64.pacman` (`sudo pacman -U`), and `packaging/aur` has the
  recipe for an AUR `typelens-bin` package.

### Changed

- **License.** TypeLens is now licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
  Versions up to and including 1.0.2 were released under the MIT License.
- The popup's main button opens the built-in dashboard; **Open app** appears next to the desktop status when the app
  is running. The old "Open web dashboard (dev)" button is gone.
- Dependencies: React 19, Vite 8, Vitest 5, chart.js 4.6, lucide-react 1.x, esbuild 0.28, electron-builder 26.18 and
  others. Dependabot now groups packages that must be updated together.

### Fixed

- Extension pages in Firefox (`moz-extension://`) were refused by the background worker, which only accepted
  `chrome-extension://` pages.

## [1.0.2] - 2026-10-10

### Added

- **Settings page.** A new page at the bottom of the sidebar (`Ctrl+,` / `Cmd+,`) with Appearance, the app
  options (start at login, notifications, updates) and the Danger zone. Delete-all-data moved here from the Data page.
- **Themes.** Ten built-in themes: TypeLens (default), Serika Dark, GitHub Dark, GitHub Light, Catppuccin Mocha,
  Catppuccin Latte, Nord, Dracula, Gruvbox and Tokyo Night. Charts and every page follow the theme straight away.
- **Sync from Monkeytype.** The extension reads the colours of your Monkeytype theme (built-in or custom) on
  monkeytype.com and the dashboard can follow it, including later changes.
- **Custom theme.** Pick your own six colours, like Monkeytype's custom themes, starting from any built-in theme or
  your Monkeytype theme.

## [1.0.1] - 2026-10-10

### Fixed

- **Tests were saved only when the next test started, marked as restarted.** Monkeytype's new result screen is added
  to the page when a test ends instead of being un-hidden, and its numbers moved. The recorder now detects it, reads
  the stats by their labels (the old layout still works), and no longer warns that `#result` is missing.
- **Fedora: the `.rpm` could not be installed next to other Electron apps** (Slack, VS Code, ...) because of
  conflicting `/usr/lib/.build-id` links. The package no longer ships those links.

### Added

- **macOS.** Disk images for Apple Silicon (`-mac-arm64.dmg`) and Intel (`-mac-x64.dmg`). They are not notarized yet,
  so the first launch needs right-click > Open, and automatic updates are not available on macOS.
- **Hover anywhere on the result graph.** The graph now has a time axis and shows wpm so far, raw speed and errors
  so far at the exact moment under the pointer, not only at whole seconds.

## [1.0.0] - 2026-10-10

First public release of TypeLens: local, private typing analytics for Monkeytype.

### Added

- **Recording.** A Chrome MV3 browser extension records key-down and key-up timing, the characters typed, the test
  settings and the result numbers, only inside Monkeytype's typing box. It makes no requests to the internet. The
  popup shows the recording switch, how many tests are stored and how many are not yet delivered, the last test, a
  warning when Monkeytype's page no longer matches what the recorder needs, Sync now, Open TypeLens and Export JSON.
- **Automatic delivery to the desktop app.** Each finished test is sent to the desktop app as soon as it is stored. Undelivered
  tests are retried every minute and on browser start-up. Tests are only marked delivered once the app has written them to disk.
- **Desktop app.** An Electron app for Windows (NSIS installer and portable zip) and Linux (`.deb`, `.rpm`; no AppImage, because Ubuntu 23.10+ blocks its Chromium sandbox and its temporary mount path breaks the `typelens://` handler and the bundled extension folder).
  It shows the dashboard in its own window, remembers the window size and position, allows only one running copy, and
  opens from a `typelens://` link (for example from the extension popup).
- **Local sync endpoint.** The desktop app listens on `127.0.0.1` only. It accepts tests from the one paired extension,
  stores each one in an inbox and then in its session store before it answers.
- **Native menus and shortcuts.** File: Import (Ctrl+I), Export JSON (Ctrl+E), open the data folder, open the
  browser-extension folder. View: pages on Ctrl+1 to Ctrl+9, zoom, full screen. Help: project website, report a problem,
  open the log folder, check for updates, about. Right-click cut, copy and paste in text fields.
- **Native import and export dialogs.** Imports use the system open dialog (JSON or Monkeytype CSV). Exports use the
  system save dialog.
- **Notifications.** A notification when a new test arrives while the app window is in the background. It can be turned off
  on the Data page.
- **Start at login.** Optional, on the Data page. On Windows and macOS it uses login items; on Linux it writes an XDG
  autostart entry. The app then starts minimised.
- **Automatic updates.** The packaged app checks GitHub Releases shortly after launch and every six hours. It downloads
  updates in the background and installs them only after the user chooses Restart to update. Update checks are not
  available in the portable zip or in unpacked builds.
- **Pairing.** The extension is paired with the desktop app on first contact. The Data page shows the pairing and can
  reset it.
- **Analysis.** Per-key speed, error, hold and count statistics; bigram and trigram statistics; slowest and
  most-mistyped words; finger and hand statistics; keyboard and hand heatmaps; inter-key interval histogram.
- **Replay.** Keystroke replay with a Monkeytype-style text view, play and pause, speed control and a scrubber, a live
  keyboard, and a per-test WPM graph rebuilt from the stored keystrokes.
- **Overview and progress.** KPI cards, WPM and accuracy trend, a 12-month activity heatmap, current and longest streak,
  consistency and minutes-per-day charts, and improved or regressed n-grams.
- **Practice.** A generator that builds weak-spot practice text for Monkeytype's Custom mode, with focus, length and
  hand settings. The last 20 generated texts are kept.
- **Import.** Monkeytype results CSV import for long-term history (speed and accuracy only, no keystrokes), and JSON import
  of a TypeLens export.
- **Export and deletion.** JSON export of all data, CSV export of sessions and keystrokes, deletion of single sessions,
  and deletion of all data behind a typed confirmation.
- **Demo data.** Clearly labelled demo data is shown until real tests are recorded.
- **Build tooling.** Unit tests for the core, the extension, the desktop app and the sync protocol; strict TypeScript;
  GitHub Actions for continuous integration on Ubuntu and Windows, and a release workflow that builds the platform
  packages and the extension zip for a version tag.

### Security

- The sync endpoint is bound to `127.0.0.1` and checks the `Host` and `Origin` headers, pairs with a single extension,
  sends no CORS headers and validates every session before storing it.
- The desktop renderer runs sandboxed with context isolation, and a strict Content Security Policy blocks remote code
  and connections to other origins. The app's IPC handlers accept calls only from its own pages and check every argument.
- Permission requests from the dashboard (camera, microphone, notifications and similar) are denied.

### Known limitations

- No macOS build is shipped. macOS users can build from source, which is untested. Automatic updates are not available on macOS.
- Monkeytype changes its page structure from time to time. If recording stops, check the extension popup's health
  message and report it with the Monkeytype version.
- Tests imported from Monkeytype's results CSV have no keystrokes, so they have no replay and no key, n-gram or finger
  statistics.
- Unsigned Windows installers show a SmartScreen warning until code signing is configured. Linux packages are not signed.
- The portable zip does not update itself; download new versions from the Releases page.
