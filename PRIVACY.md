# Privacy

TypeLens is designed so that your typing data stays on your computer. This document says exactly what is recorded,
where it is kept, and what (if anything) leaves your machine.

## Summary

- No account, no sign-in, no telemetry, no analytics, no advertising identifiers.
- Nothing is sent to the TypeLens project or to any third party.
- The desktop app contacts **GitHub Releases** only to check whether a new version exists (and to download an update
  if you accept it). That is the only outbound network request the desktop app makes.
- The browser extension makes **no requests to the internet**. It talks to the desktop app on `127.0.0.1` only.

## What is recorded

The extension records only inside Monkeytype's typing box (the hidden text area with the id `wordsInput`).

For each test it stores:

- The keystrokes typed in that box: the physical key and the key-down and key-up times, in milliseconds.
- The logical input: characters inserted, deleted and committed, with word and character positions, so corrections
  can be replayed.
- The words of the test text, as they were rendered.
- The test settings: mode (time, words, quote, zen or custom), mode value, language, punctuation, numbers, fun boxes
  and difficulty.
- The result numbers shown on Monkeytype's result screen (WPM, raw WPM, accuracy, consistency, character counts and
  duration), plus quality flags, for example when the derived numbers disagree with Monkeytype's.
- Technical metadata: the test's start time, a generated session id, and the extension version.

It does **not** record:

- Anything typed outside `#wordsInput`: the login form, search, command line, settings fields, or any other site.
- Your Monkeytype account details, password, email address or cookies.
- Screen contents, screenshots, the clipboard, or the mouse.

The extension never cancels, changes or blocks an event, and it does not edit the Monkeytype page.

## Where it is stored

| Stage | Where | Notes |
| --- | --- | --- |
| Recorder | The extension's own IndexedDB database `typelens`, inside your browser profile | Holds tests until they are delivered to the desktop app. The extension also keeps small state in its storage: the pause switch, the recorder's health check and the last delivery status. |
| Desktop inbox | The app's profile folder, `inbox/` (one JSON file per test) | Written before the app acknowledges a test. The app moves it into the store straight away, so it is normally empty. |
| Sessions | The app's profile folder, `data/sessions/` (one JSON file per test) | Analysed tests shown in the dashboard. |
| Preferences | `data/prefs.json` in the app's profile folder | The data source choice and the last 20 generated practice texts. |
| Settings | `settings.json` in the app's profile folder | Window size and position, the paired extension id, and the start-at-login and notification choices. |
| Logs | `logs/main.log` in the app's profile folder (the previous log is kept as `main.log.old`) | Start-up and error messages and session counts. No keystroke content. |

In a plain browser (the dashboard run outside the desktop app, for development), the dashboard keeps its tests in the
browser's IndexedDB database `typelens-web` and its preferences in the browser's local storage, on that computer only.

Profile folders:

- Windows: `%APPDATA%\TypeLens`
- Linux: `~/.config/TypeLens`

TypeLens does not encrypt its data. Anyone with access to your user account can read these files, so use your
operating system's account protection and disk encryption as you would for any personal file.

## What leaves your machine

Nothing, apart from the following:

- **Update checks:** the desktop app asks GitHub Releases whether a newer version is available and, if you accept,
  downloads it. GitHub sees the usual request details (such as your IP address) for these requests.
- **Links you open:** links in the app's Help menu, and external links in the dashboard, open in your default browser
  only when you click them.
- **Monkeytype:** your browser talks to monkeytype.com as it always does. TypeLens does not add requests to that site.

The dashboard runs with a strict Content Security Policy that only permits connections to its own local origin, so the
analysis screens cannot send your data anywhere.

## Your controls

- **Pause recording:** the extension popup can pause recording.
- **Export:** the dashboard's Data page exports everything as JSON, and sessions and keystrokes as CSV.
- **Delete:** delete a single session, or all data behind a typed `DELETE` confirmation, on the Data page.
- **Uninstall:** removing the extension deletes its local database. Uninstalling the desktop app does not necessarily
  remove your profile folder; delete it yourself if you want all data gone.
- **Reset pairing:** the desktop app can forget the paired extension, so a different extension can pair.

## Third-party services

TypeLens does not use third-party services for analytics, crash reporting or hosting of your data.
Monkeytype is not affiliated with TypeLens, and its own privacy policy applies to your use of that site.

## Changes to this policy

If a future version records or sends anything new, this document will be updated in the same release, and the change
will be listed in [CHANGELOG.md](CHANGELOG.md).

## Contact

Privacy questions: open a GitHub issue (do not include personal data), or contact **PRIVACY_CONTACT_PLACEHOLDER**.
