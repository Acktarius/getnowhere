#!/bin/bash
# Replace Forge's /usr/bin/getnowhere symlink and open the app tree.
# @see docs/builds/github-pages-and-desktop.md
set -euo pipefail

deb=${1:?deb}
version=${2:?version}
here=$(dirname "$(readlink -f "$0")")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

dpkg-deb -R "$deb" "$work"
link="$work/usr/bin/getnowhere"
[[ -L "$link" ]] || {
  echo "expected symlink: $link" >&2
  exit 1
}
rel=$(readlink "$link")
if [[ "$rel" == /* ]]; then
  app=$rel
else
  app=$(realpath -m "/usr/bin/$rel")
fi
rm -f "$link"
bash "$here/install-cli-wrapper.sh" "$version" "$app" "$link"

appdir="$work$(dirname "$app")"
[[ -d "$appdir" ]] || {
  echo "app dir missing in deb: $appdir" >&2
  exit 1
}
find "$appdir" -type d -exec chmod 755 {} +
find "$appdir" -type f -exec chmod a+rX {} +
dpkg-deb --root-owner-group -b "$work" "$deb" >/dev/null
