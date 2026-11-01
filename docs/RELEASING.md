# Releasing TypeLens

This is the checklist for publishing a version. The build is automated by `.github/workflows/release.yml`; the steps
below are the parts a maintainer does by hand.

Versions: the desktop app and the browser extension are versioned separately in their `package.json` files, but both
are shipped under the same release tag. Keep them equal for a release, so the release notes and the artifact names
match.

## 1. One-time setup (first release only)

- [x] The GitHub repository is set to `HACKERHSB1453/Typelens` in `publish.owner` / `publish.repo` in
  `apps/desktop/electron-builder.yml`. This is the one value the desktop build reads: the auto-updater feed and the
  in-app links are derived from it. The other project links (`apps/extension/build.mjs` `homepage_url`, `README.md`,
  `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/config.yml`, `apps/desktop/package.json` `homepage` / `repository`) use the
  same repository. A fork must change all of them to its own owner/repo.
- [ ] Replace the remaining placeholders: `SECURITY_CONTACT_PLACEHOLDER` (SECURITY.md), `PRIVACY_CONTACT_PLACEHOLDER`
  (PRIVACY.md) and `CODE_OF_CONDUCT_CONTACT_PLACEHOLDER` (CODE_OF_CONDUCT.md).
- [ ] Set the date of the 1.0.0 entry in `CHANGELOG.md` (replace `RELEASE_DATE_PLACEHOLDER`) when the release is cut.
- [ ] If `publish.owner` is still `OWNER_PLACEHOLDER` (a fork that has not set it), the desktop build prints a warning and
  updates stay disabled.
- [ ] Optional, for a Firefox add-on that installs permanently: create API keys at addons.mozilla.org (Developer Hub →
  Manage API Keys) and add them as the repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`. The release workflow
  then has Mozilla sign an unlisted `.xpi`. Without them only the unsigned Firefox zip is published.
- [ ] Optional: publish the AUR package `typelens-bin` after each release (see `packaging/aur/README.md`).
- [ ] In the repository settings, enable **Security -> Private vulnerability reporting** (Security Advisories), because
  `SECURITY.md` and the issue template point to it.
- [ ] Make sure `apps/extension/dist.pem` (the Chrome signing key) and `apps/extension/dist.crx` are **not** in the
  repository. Both patterns (`*.pem`, `*.crx`) are gitignored, but the files are present in this working copy: move them
  out of the repository folder, keep a copy somewhere safe, and rotate the key if either file was ever pushed.

## 2. Before you tag

- [ ] `main` is green in CI (Ubuntu and Windows).
- [ ] Bump `version` in `apps/desktop/package.json` and in `apps/extension/package.json` to the same `X.Y.Z`.
  The extension's `manifest.json` version is taken from its `package.json` at build time.
- [ ] Move the changes in `CHANGELOG.md` from `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, and add a new empty
  `## [Unreleased]` heading above it.
- [ ] Run the checks locally:

  ```bash
  npm ci
  npm test
  npm run typecheck
  npm run build
  ```

- [ ] Optional: build the packages locally with `npm run dist:win` (Windows) or `npm run dist:linux`, and install the
  result on a clean machine before you tag.
- [ ] Commit the version bump and changelog as `chore: release vX.Y.Z`.

## 3. Tag and build

```bash
git tag -a vX.Y.Z -m "TypeLens X.Y.Z"
git push origin main
git push origin vX.Y.Z
```

The tag must be exactly `v` followed by the desktop version. The `version` job in `release.yml` fails the run if they
differ, before anything is built.

The workflow then:

1. builds the Windows NSIS installer and zip with `npm run dist:win` on `windows-latest`;
2. installs `rpm`, then builds the `.deb` and `.rpm` with `npm run dist:linux` on `ubuntu-latest`;
3. builds the extension (`npm run build -w @typelens/extension`) and zips it as `TypeLens-extension-X.Y.Z.zip`;
4. creates a **draft** GitHub Release for the tag with all artifacts and generated release notes.

To test the build without creating a release, run the workflow manually from the **Actions** tab (`workflow_dispatch`).
Its artifacts appear on the run page and nothing is published.

## 4. Verify the artifacts

Open the draft release and check that these files are attached:

- [ ] `TypeLens-Setup-X.Y.Z-x64.exe` (Windows installer) and `TypeLens-X.Y.Z-win-x64.zip`
- [ ] `TypeLens-extension-X.Y.Z.zip`
- [ ] `TypeLens-X.Y.Z-amd64.deb`, `TypeLens-X.Y.Z-x86_64.rpm`
  (names from the `artifactName` patterns in `apps/desktop/electron-builder.yml`; check them on the first Linux build)
- [ ] `latest.yml` (Windows update manifest) and `latest-linux.yml` (Linux update manifest), both showing version `X.Y.Z`
- [ ] `*.blockmap` files for the installers

Then, on real machines or clean VMs:

- [ ] Windows: install the `.exe`, start TypeLens, the window opens and the sync endpoint status shows listening.
- [ ] Linux: `sudo apt install ./TypeLens-X.Y.Z-amd64.deb` (Ubuntu 24.04 is the reference; the `.rpm` on Fedora is
  `sudo dnf install ./TypeLens-X.Y.Z-x86_64.rpm`) and start TypeLens. The `.deb` must install without a missing `libasound` error.
- [ ] Extension: unzip `TypeLens-extension-X.Y.Z.zip`, load it unpacked in Chrome, record one test on monkeytype.com,
  and check that it reaches the desktop app.
- [ ] Update path: install the previous release, then check that TypeLens offers the new version once the release is
  published (draft releases are not visible to the updater).

## 5. Publish

- [ ] Edit the draft's release notes if needed (the changelog section is the source of truth).
- [ ] Click **Publish release**. Mark it as the latest release unless it is a pre-release. Tags containing a hyphen
  (for example `v1.1.0-beta.1`) are created as pre-releases automatically.

Publishing is what makes the new `latest*.yml` files available to installed apps.

## 6. Optional: code signing

Unsigned builds work, but Windows shows a SmartScreen warning and macOS (not shipped) would require signing.

Windows (Authenticode):

1. Obtain a code-signing certificate (a `.pfx` file).
2. Add repository secrets `CSC_LINK` (the base64 of the `.pfx`, or an HTTPS URL to it) and `CSC_KEY_PASSWORD`.
3. In `.github/workflows/release.yml`, uncomment the two `CSC_*` lines in the `build-windows` job.

Linux packages are not signed by this pipeline.

## After the release

- [ ] Add a new `## [Unreleased]` section to `CHANGELOG.md` if it is not already there.
- [ ] Close the milestone or issues that the release fixed.
- [ ] If a security issue was fixed, publish the GitHub Security Advisory after the release is out.
