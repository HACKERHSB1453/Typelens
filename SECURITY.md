# Security Policy

## Supported versions

Security fixes are released for the latest published version only. Please update to the newest release before
reporting a problem.

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| < 1.0   | No        |

## Reporting a vulnerability

**Please do not report security problems in public issues, pull requests or discussions.**

Report them privately using GitHub Security Advisories:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** and describe the problem.

If you cannot use GitHub, contact **SECURITY_CONTACT_PLACEHOLDER**.

Please include:

- the TypeLens version (desktop app and extension), operating system and browser;
- the steps to reproduce, and what you expected to happen;
- the impact you believe the problem has.

We will acknowledge reports as soon as we can, keep you informed while we investigate, and credit you in the release
notes if you want us to. Please give us a reasonable time to release a fix before any public disclosure.

## Threat model

TypeLens is a local-first application. Its main assets are the typing data stored on your computer, and the
integrity of the analysis shown to you.

**Local sync endpoint.** The desktop app listens on `127.0.0.1:47615` only, so it cannot be reached from the network.
A request is accepted only when:

- the `Host` header is `127.0.0.1:47615` or `localhost:47615`, which blocks DNS-rebinding attacks from web pages;
- the `Origin` header is a browser extension origin (`chrome-extension://` or `moz-extension://`). Web pages cannot
  forge this header;
- after first contact the extension is **paired**, and requests from any other extension id are refused. The user can
  reset pairing in the desktop app.

The endpoint sends **no CORS headers**, so a web page cannot read a response even if it could send a request. Request
bodies must be JSON and are capped in size. Every pushed session is checked with the same validator used for file
imports before it is stored.

**Limits of that model.** `Origin` is enforced by the browser, not by a secret. A program running on your own computer
can craft a request that looks like it came from the extension, so the endpoint cannot stop a hostile local program
from delivering fabricated sessions. It does not let a caller read stored data: the endpoint only accepts pushes and
returns acknowledgements, and stored tests are reached through the desktop app's own IPC, which only the app's pages
can use. Protecting against malware already running as your user account is outside what TypeLens can defend against.

**Desktop app hardening.**

- The dashboard runs in an Electron renderer with `contextIsolation` on, `sandbox` on, `nodeIntegration` off and
  `webviewTag` off. The preload script exposes a small, fixed API only.
- Its Content Security Policy allows scripts and connections only from the app's own origin. There is no remote code
  and no remote script loading.
- The app's IPC handlers accept calls only from its own pages.
- Permission requests (camera, microphone, notifications, location and so on) are denied.
- Navigation away from the dashboard is blocked, and new windows are denied. Only `https://` links are opened, in your
  default browser.

**Browser extension.** It requests the `storage`, `unlimitedStorage`, `scripting` and `alarms` permissions. Its only host
permission is `http://127.0.0.1:47615/*` (the desktop app). Its content scripts run only on `monkeytype.com` (the
recorder) and on the dashboard's local origins, `localhost:5173` and `127.0.0.1:5173` (the bridge). It makes no outbound
requests to the internet and does not load remote code. The page bridge accepts only four whitelisted actions.

**Supply chain.** Dependencies are updated through Dependabot. The release workflow builds artifacts from tagged commits
in GitHub Actions, and releases are created as drafts for a maintainer to check before publishing. Code signing is
optional and not yet enabled (see [docs/RELEASING.md](docs/RELEASING.md)); unsigned Windows installers will show a
SmartScreen warning.

## Out of scope

- Denial of service against your own local app.
- Issues that require a malicious program already running as your user account.
- Problems in Monkeytype itself, or in Chrome, Edge, Brave, Electron or the operating system. Please report those to
  their maintainers.
