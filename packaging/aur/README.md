# Arch Linux packaging

Every release already contains an Arch package, `TypeLens-<version>-x64.pacman`, built by electron-builder in
`.github/workflows/release.yml`. Users can install it directly:

```bash
sudo pacman -U ./TypeLens-<version>-x64.pacman
```

`typelens-bin/` is the recipe for the AUR, so people can install and update with an AUR helper
(`yay -S typelens-bin`, `paru -S typelens-bin`). It repackages that same `.pacman` file.

## Publishing to the AUR (maintainer, on an Arch machine)

First time: create an account on <https://aur.archlinux.org>, add your SSH key, then:

```bash
git clone ssh://aur@aur.archlinux.org/typelens-bin.git aur-typelens-bin
```

For each release:

```bash
cp packaging/aur/typelens-bin/PKGBUILD aur-typelens-bin/
cd aur-typelens-bin
# set pkgver to the release version (and pkgrel=1), then:
updpkgsums
makepkg --printsrcinfo > .SRCINFO
makepkg -si          # test install
git add PKGBUILD .SRCINFO
git commit -m "Update to <version>"
git push
```
