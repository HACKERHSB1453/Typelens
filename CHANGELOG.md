# Changelog

All notable changes to TypeLens are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - RELEASE_DATE_PLACEHOLDER

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
