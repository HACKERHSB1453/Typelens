<div align="center">

<img src="apps/desktop/build/icon-256.png" alt="TypeLens logo" width="88" height="88">

# TypeLens

**Local, private typing analytics for [Monkeytype](https://monkeytype.com).**

See exactly which keys, letter pairs, words and fingers slow you down, replay every test keystroke by keystroke,
and generate practice text that targets your weak spots. Everything stays on your computer.

[![Latest release](https://img.shields.io/github/v/release/HACKERHSB1453/Typelens?label=release&color=white)](https://github.com/HACKERHSB1453/Typelens/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/HACKERHSB1453/Typelens/total?color=white)](https://github.com/HACKERHSB1453/Typelens/releases)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-white)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Browser-white)
![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Brave%20%7C%20Firefox-white)

[**Download**](https://github.com/HACKERHSB1453/Typelens/releases/latest) ·
[Getting started](#getting-started) ·
[Updating](#updating) ·
[Using TypeLens](#using-typelens) ·
[Privacy](#privacy) ·
[Build from source](#build-from-source)

<br>

<img src="docs/screenshots/overview.png" alt="TypeLens overview dashboard with KPI cards and a WPM and accuracy trend chart" width="900">

</div>

---

## Why TypeLens?

Monkeytype tells you your WPM and accuracy, but it only keeps the totals. It doesn't tell you *why* you are slow.

TypeLens records the timing of every key you press and release while you take a test, then analyses it on your own
machine. You get per-key speed and error rates, the bigrams and trigrams that cost you the most time, finger and hand
balance, word-level burst speed and a full replay of each test. It then turns your weak spots into practice text you
can paste straight into Monkeytype.

- **Private by design.** No account, no telemetry, no cloud. Your data never leaves your computer.
- **Zero effort.** Type on Monkeytype as usual. Tests appear in the app automatically.
- **Actionable.** Every chart points at something you can practise, and the practice generator does it for you.

> TypeLens is an independent project and is **not affiliated with Monkeytype or TypeQuicker**.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/keys.png" alt="Keyboard heatmap with per-key statistics"><br><b>Keys.</b> Keyboard heatmap by speed, errors, hold time or count, with a per-key table and common mistypes.</td>
    <td width="50%"><img src="docs/screenshots/ngrams.png" alt="Bigram table ranked by time cost"><br><b>N-grams.</b> Bigrams and trigrams ranked by how much time they cost you. Select some and practise them directly.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/replay.png" alt="Replay of a single test with result graph and word speed"><br><b>Replay.</b> The result graph Monkeytype throws away, word burst speeds, and a keystroke-by-keystroke replay.</td>
    <td width="50%"><img src="docs/screenshots/fingers.png" alt="Hand heatmap showing per-finger speed"><br><b>Fingers &amp; hands.</b> Per-finger speed, errors, hold time and rollover, plus left-versus-right balance.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/progress.png" alt="Progress charts for WPM, accuracy, consistency and minutes per day"><br><b>Progress.</b> WPM, accuracy, consistency and practice time over time, with streaks.</td>
    <td width="50%"><img src="docs/screenshots/practice.png" alt="Practice text generator"><br><b>Practice.</b> Generate a drill from your weakest n-grams, keys or fingers and paste it into Monkeytype.</td>
  </tr>
</table>

<sub>Screenshots show the built-in demo data, which the app displays until your first real test arrives.</sub>

## Getting started

There are two ways to use TypeLens. Both record the same data and show the same dashboard.

| | **A. Desktop app + extension** (recommended) | **B. Browser only** |
| --- | --- | --- |
| Install | The app, then the extension | Only the extension |
| Where the dashboard opens | In the TypeLens app | In a browser tab (toolbar button → **Open dashboard**) |
| Updates | Automatic (Windows, Linux) | By hand |
| Good for | Your own computer | School or work computers, Chromebooks, trying it out |

Already installed and stuck? Open **Get started** in the TypeLens sidebar. It shows these same steps for your browser
and ticks each one off when it's done.

### A. Desktop app + extension

**Step 1: Install the app.** Download the file for your system from the
[**latest release**](https://github.com/HACKERHSB1453/Typelens/releases/latest) (scroll down to **Assets**):

| Your system | Download | Then |
| --- | --- | --- |
| **Windows 10 / 11** | `TypeLens-Setup-<version>-x64.exe` | Double-click it and follow the installer. |
| **Mac with Apple chip (M1 or newer)** | `TypeLens-<version>-mac-arm64.dmg` | Open it and drag **TypeLens** into **Applications**. |
| **Mac with Intel chip** | `TypeLens-<version>-mac-x64.dmg` | Same as above. Not sure which Mac? Apple menu → **About This Mac** → "Chip". |
| **Ubuntu / Debian / Mint** | `TypeLens-<version>-amd64.deb` | In a terminal in your Downloads folder: `sudo apt install ./TypeLens-<version>-amd64.deb` |
| **Fedora** | `TypeLens-<version>-x86_64.rpm` | `sudo dnf install ./TypeLens-<version>-x86_64.rpm` |
| **Arch / Manjaro / EndeavourOS** | `TypeLens-<version>-x64.pacman` | `sudo pacman -U ./TypeLens-<version>-x64.pacman` (or the AUR package, see [`packaging/aur`](packaging/aur/README.md)) |

Replace `<version>` with the version you downloaded, e.g. `1.1.0`. The first time you open TypeLens:

- **Windows** may say *"Windows protected your PC"* because the installer isn't code-signed yet. Click
  **More info**, then **Run anyway**.
- **macOS** may say the app *"cannot be opened because the developer cannot be verified"*. In **Applications**,
  right-click TypeLens, choose **Open**, then **Open** again. On macOS 15 or newer, if there's no Open button, go to
  **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. You only do this once.

**Step 2: Add the extension to your browser.** The extension is what records your typing. It comes with the app, so
there's nothing else to download. Follow the steps for your browser below, using this folder:

| Your system | Extension folder (Chrome, Edge, Brave, Opera, Vivaldi) |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Programs\TypeLens\resources\extension` |
| macOS | `/Applications/TypeLens.app/Contents/Resources/extension` (in the folder picker, press `Cmd+Shift+G` and paste it) |
| Linux | `/opt/TypeLens/resources/extension` |

For Firefox, use the `extension-firefox` folder next to it. In the app, **Get started** shows your exact folder with a
**Copy** button, and **File → Open browser-extension folder** opens it.

**Step 3: Take a test.** Keep the app running (it can be in the background), go to
[monkeytype.com](https://monkeytype.com) (reload it if it was already open) and type a test to the end. It shows up in
TypeLens within a few seconds, and the demo data is replaced by yours.

The extension's toolbar badge counts tests waiting for the app, for example while it's closed. They're delivered the
next time it runs, so nothing is lost.

### B. Browser only

1. Download `TypeLens-extension-<version>.zip` (or `TypeLens-extension-firefox-<version>.zip` for Firefox) from the
   [**latest release**](https://github.com/HACKERHSB1453/Typelens/releases/latest).
2. Unzip it into a folder you'll keep, for example `Documents/TypeLens-extension`. Don't delete the folder later: the
   browser loads the extension from it every time it starts.
3. Add the extension from that folder, following the steps for your browser below.
4. Go to [monkeytype.com](https://monkeytype.com) and type a test to the end.
5. Click the TypeLens button in the toolbar, then **Open dashboard**.

New tests appear in the open dashboard as soon as you finish them. They're stored in the browser's extension storage
on this computer and survive restarts, but **removing the extension deletes them**. Use **Data → Export JSON** for a
backup, and **Import** to bring it back or move it into the desktop app later.

### Adding the extension, browser by browser

#### Chrome, Edge, Brave, Opera, Vivaldi

1. Click the address bar, type the address for your browser and press Enter: `chrome://extensions` (Chrome),
   `edge://extensions` (Edge), `brave://extensions` (Brave), `opera://extensions` (Opera) or `vivaldi://extensions`
   (Vivaldi). Browsers don't let these be opened from a link.
2. Turn on **Developer mode**: a switch in the top-right corner (in Edge, in the left sidebar).
3. Click **Load unpacked**, which appears once Developer mode is on.
4. Select the extension folder (from step 2 of A, or the folder you unzipped in B) and click **Select Folder**.
5. Optional: click the puzzle-piece icon next to the address bar and pin **TypeLens**, so its button is always visible.

#### Firefox

- **Permanent install:** if the release has a `TypeLens-extension-firefox-<version>.xpi` file, open it with Firefox
  (or drag it onto a Firefox window) and click **Add**.
- **Without an .xpi:** go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, open the
  Firefox extension folder and select `manifest.json`. Firefox removes temporary add-ons when it closes, so you'll
  have to repeat this after each restart.

Then click the TypeLens button in the toolbar. If it shows **Allow access**, click it: Firefox asks before an
extension may read monkeytype.com and talk to the TypeLens app.

## Updating

**The app.** On Windows and Linux, TypeLens checks for new versions shortly after it starts and every six hours. An
update downloads in the background and installs when you click **Restart to update** (Linux asks for your password,
because the package manager installs it). You can also check by hand in **Settings**. On macOS, and for the portable
Windows `.zip`, download the new version from the [releases page](https://github.com/HACKERHSB1453/Typelens/releases).

**The extension.** If you loaded it from the app's folder, an app update already put the new extension there. The
browser picks it up the next time it restarts, or right away when you click the reload button (↻) on the TypeLens card
in `chrome://extensions`. If you loaded it from an extracted zip, download the new
`TypeLens-extension-<version>.zip`, replace the folder's contents and click reload.

The changes in each version are listed in the [changelog](CHANGELOG.md).

## Using TypeLens

The sidebar has one page per kind of analysis. The filter bar at the top applies to every page: pick a time range
(7d / 30d / 90d / all), Monkeytype modes, language, a minimum sample size, and whether to include practice tests.

| Page | What it answers |
| --- | --- |
| **Overview** | How am I doing overall? KPIs compared with the previous period, insights, goals, personal bests, a trend chart, a 12-month activity heatmap and your weakest spots. |
| **Keys** | Which keys are slow or error-prone? Click a key on the heatmap to inspect it and see what you mistype it as. |
| **N-grams** | Which letter pairs and triples cost the most time? Sort by impact to find the biggest wins. |
| **Words** | Which words are slowest or most often mistyped? |
| **Fingers** | Which fingers and which hand hold you back? Includes same-finger bigrams and hand alternation. |
| **Replay** | What actually happened in a specific test? Watch it back at 0.5×–4× with a live keyboard. |
| **Progress** | Am I improving? Long-term charts, improved and regressed n-grams, and streaks. |
| **Practice** | What should I practise? Generates targeted text from your weak spots. |
| **Data** | Import, export, extension status and pairing, and deleting single tests. |

### A practice loop that works

1. Take 5–10 normal tests on Monkeytype so TypeLens has enough data.
2. Open **N-grams**, sort by **Impact**, tick the worst few and click **Practice selected**. Or open **Practice** and
   leave the focus on **auto**.
3. Click **Generate**, then copy the text.
4. On Monkeytype, choose **custom → change**, paste the text and type it.
5. TypeLens links that test to the drill, so you can compare before and after.

### Import your Monkeytype history

On Monkeytype, go to **Account → export CSV**. Then in TypeLens open **Data → Import JSON / Monkeytype CSV** (or press
`Ctrl+I`). Imported tests add to your long-term WPM and accuracy history. They have no replay or key statistics,
because Monkeytype never stored keystrokes for them.

### Goals and personal bests

Set a weekly practice time and a target speed in **Settings → Goals**; the Overview shows how far along you are this
week. The **Personal bests** card lists your fastest test per mode, and tests that beat your previous best are marked
**PB** in the session list.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` (`Cmd+K` on macOS) | Command palette: go to a page, change the date range, switch theme, import or export |
| `Ctrl+1` … `Ctrl+9` | Switch pages |
| `Ctrl+I` | Import |
| `Ctrl+E` | Export everything as JSON |
| `Ctrl+,` | Settings |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |

### Settings and themes

Open **Settings** from the bottom of the sidebar (or press `Ctrl+,`, `Cmd+,` on macOS).

<img src="docs/screenshots/settings.png" alt="Settings page with the theme picker" width="900">

- **Themes.** Pick one of the built-in themes: TypeLens, Serika Dark, GitHub Dark and Light, Catppuccin Mocha and
  Latte, Nord, Dracula, Gruvbox and Tokyo Night.
- **Sync from Monkeytype.** TypeLens uses the theme you have on monkeytype.com, including custom themes, and follows
  it when you change it there. The extension reads the colours while you are on Monkeytype.
- **Custom.** Set your own six colours (background, panels, secondary text, text, accent and error), the same way
  Monkeytype's custom themes work. You can start from any built-in theme or from your Monkeytype theme.
- **Start at login.** Launches TypeLens in the background so tests always arrive.
- **Notifications.** Shows a notification when a new test arrives while the window is in the background.
- **Updates.** TypeLens checks GitHub Releases shortly after launch and every six hours. Updates download in the
  background and install only when you click **Restart to update**.
- **Delete all data.** In the Danger zone, behind a typed `DELETE` confirmation.

## Troubleshooting

<details>
<summary><b>Tests don't show up in the app</b></summary>

- Make sure the desktop app is running. The extension holds tests until it can deliver them, and the badge shows the count.
- Click the TypeLens toolbar button and press **Sync now**. The popup shows whether it reached the app.
- Check that the extension is enabled (`chrome://extensions`, or `about:addons` in Firefox) and that its folder still
  exists.
- In Firefox, if the popup shows **Allow access**, click it.
- If you reinstalled the extension, its id changed and the app still trusts the old one. Click **Reset pairing** in
  the Extension panel on the **Data** page, then reload monkeytype.com.

</details>

<details>
<summary><b>Fedora: "file /usr/lib/.build-id/... conflicts with file from package ..."</b></summary>

This only affects TypeLens 1.0.0, which clashed with other Electron apps (Slack, VS Code and others). Version 1.0.1
and later install normally. To install 1.0.0 anyway, leave out the conflicting debug links:

```bash
sudo rpm -i --excludepath=/usr/lib/.build-id TypeLens-<version>-x86_64.rpm
```

</details>

<details>
<summary><b>macOS says TypeLens "is damaged" or "cannot be opened"</b></summary>

The app isn't notarized by Apple yet. Right-click TypeLens in Applications and choose **Open**, or use **System
Settings → Privacy & Security → Open Anyway**. If macOS still says it is damaged, clear the download quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/TypeLens.app
```

</details>

<details>
<summary><b>Windows says "Windows protected your PC"</b></summary>

The installer isn't code-signed yet. Click **More info → Run anyway**.

</details>

<details>
<summary><b>I updated TypeLens but the extension is still old</b></summary>

The browser only reads the extension's files when it starts or when you reload the extension. Click the reload button
(↻) on the TypeLens card in `chrome://extensions`. If it is still old, check which folder it was loaded from (shown on
the card): if it's not the app's folder, see [Load the browser extension](#adding-the-extension-browser-by-browser) and load it
from there instead.

</details>

## How it works

```mermaid
flowchart LR
  MT["Monkeytype tab<br/>monkeytype.com"] -- "keydown / keyup in #wordsInput" --> EXT["Browser extension<br/>recorder + local store"]
  EXT -- "HTTP to 127.0.0.1:47615<br/>only the paired extension" --> APP["TypeLens desktop app<br/>sync endpoint + inbox"]
  APP -- "writes one file per test" --> DISK[("Profile folder<br/>on your computer")]
  APP -- "renders" --> DASH["Dashboard<br/>analysis in packages/core"]
  DASH -- "stores analysed tests" --> DISK
```

1. The **recorder** runs only on monkeytype.com, inside Monkeytype's typing box. It is passive: it never changes an
   event or edits the page, and it never records other fields or other sites.
2. The **extension** stores finished tests locally and pushes them to the desktop app on `127.0.0.1`. The app writes
   each test to disk before replying, so a test is only marked delivered once it is safe.
3. The **dashboard** computes every statistic locally with the shared analysis engine in `packages/core`.

The full design, including storage locations and the message contract, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Privacy

TypeLens runs entirely on your computer. There is **no account, no telemetry, no analytics and no cloud service**.
The extension makes no requests to the internet. The desktop app contacts GitHub only to check for updates, and its
sync endpoint listens on `127.0.0.1` only. What is recorded, where it is stored and what (if anything) leaves your
machine is listed in [PRIVACY.md](PRIVACY.md).

You can export all of your data as JSON or CSV from the **Data** page, and delete it at any time from **Settings**.

## Build from source

Requirements: **Node.js 22** and npm. The repository is an npm workspace.

```bash
npm ci                    # install all workspaces
npm test                  # unit tests
npm run typecheck         # strict TypeScript across the workspaces
npm run start:desktop     # run the desktop app from source
npm run dev:desktop       # desktop app with hot reload
npm run build -w @typelens/extension   # extension -> apps/extension/dist (Chromium), dist-firefox (Firefox)
npm run dist:linux        # .deb, .rpm and .pacman -> apps/desktop/release (needs rpm and bsdtar)
npm run dist:win          # .exe and .zip   -> apps/desktop/release
npm run dist:mac          # .dmg (on a Mac) -> apps/desktop/release
```

Linux packages can also be built anywhere Docker runs, using the official Electron builder image:

```bash
docker run --rm -ti -v "${PWD}:/project" -w /project electronuserland/builder /bin/bash -c "npm ci && npm run dist:linux"
```


### Project structure

```
apps/desktop/      Electron app: window, local sync endpoint, inbox, auto-update
apps/extension/    Chrome MV3 extension: recorder on monkeytype.com, local store, popup
apps/web/          React + Vite dashboard (the screens shown in the desktop app)
packages/core/     analysis engine (pure TypeScript) and the data contract
docs/              architecture, release process and screenshots
.github/           CI, release workflow, issue and pull request templates
```

## Contributing

Bug reports, feature ideas and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.
Report security issues privately as described in [SECURITY.md](SECURITY.md). This project follows the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License and acknowledgements

Copyright (C) 2026 TypeLens contributors.

TypeLens is free software: you can redistribute it and/or modify it under the terms of the
[GNU General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the License,
or (at your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

In short: you may use, study, share and change TypeLens. If you distribute it, or a modified version, you must do so
under the same license and make the complete source code available. Versions up to and including 1.0.2 were
released under the MIT License.

- TypeLens is **not affiliated with, endorsed by or sponsored by Monkeytype or TypeQuicker**. Monkeytype and
  TypeQuicker are trademarks of their respective owners. TypeLens is inspired by TypeQuicker's analytics.
- Monkeytype is licensed under the GPL. TypeLens does not copy Monkeytype's code. It reimplements the published
  formulas (for example WPM and accuracy). The practice word list was compiled for this project.
- Built with Electron, React, Chart.js and the Hack font. See each package's dependencies for their licenses.
- The analysis is an estimate built from the keystrokes your browser reports. Timing depends on your keyboard, OS and
  browser, so treat the numbers as a guide, not an official score.
