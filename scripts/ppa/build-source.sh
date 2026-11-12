#!/usr/bin/env bash
# Unsigned Ubuntu PPA source package for the packaged desktop app.
# @see docs/builds/ppa-source.md
set -euo pipefail

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
usage: build-source.sh --payload DIR --version X.Y.Z [--icon FILE] OUTPUT-DIR

Writes one unsigned source package per series in PPA_SERIES
(default: jammy noble resolute).
EOF
}

normalize_series() {
  case "$1" in
    22 | 22.04 | jammy) printf '%s\n' jammy ;;
    24 | 24.04 | noble) printf '%s\n' noble ;;
    26 | 26.04 | resolute) printf '%s\n' resolute ;;
    *) return 1 ;;
  esac
}

require_int() {
  [[ "$2" =~ ^[0-9]+$ ]] || die "$1 must be a non-negative integer"
}

payload=""
version=""
icon=""
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --payload)
      [[ $# -ge 2 ]] || die "--payload needs a path"
      payload=$2
      shift 2
      ;;
    --version)
      [[ $# -ge 2 ]] || die "--version needs a value"
      version=$2
      shift 2
      ;;
    --icon)
      [[ $# -ge 2 ]] || die "--icon needs a path"
      icon=$2
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      [[ -z "$out" ]] || die "unknown argument"
      out=$1
      shift
      ;;
  esac
done

[[ -n "$payload" && -n "$version" && -n "$out" ]] || die "usage: build-source.sh --payload DIR --version X.Y.Z OUTPUT-DIR"
[[ -f "$payload/getnowhere" ]] || die "payload has no getnowhere executable"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must look like X.Y.Z"
if [[ -n "$icon" ]]; then
  [[ -f "$icon" ]] || die "icon file is missing"
fi
if [[ -n "${PPA_HOMEPAGE:-}" ]]; then
  [[ "$PPA_HOMEPAGE" =~ ^https://[^[:space:]]+$ ]] || die "PPA_HOMEPAGE must be an https URL"
fi

revision=${PPA_DEBIAN_REVISION:-1}
suffix=${PPA_UPLOAD_SUFFIX:-1}
require_int PPA_DEBIAN_REVISION "$revision"
require_int PPA_UPLOAD_SUFFIX "$suffix"

series_raw=${PPA_SERIES:-jammy noble resolute}
series_raw=${series_raw//,/ }
read -r -a series_in <<< "$series_raw"
series_list=()
for raw in "${series_in[@]}"; do
  [[ -n "$raw" ]] || continue
  normalized=$(normalize_series "$raw") || die "unknown Ubuntu series"
  series_list+=("$normalized")
done
[[ ${#series_list[@]} -gt 0 ]] || die "PPA_SERIES is empty"

payload=$(cd "$payload" && pwd)
out_parent=$out
mkdir -p "$out_parent"
out_parent=$(cd "$out_parent" && pwd)
epoch=${SOURCE_DATE_EPOCH:-$(date +%s)}
[[ "$epoch" =~ ^[0-9]+$ ]] || die "SOURCE_DATE_EPOCH must be an integer"
commit=${PPA_COMMIT_SHORT:-unknown}

if [[ -n "${PPA_WORK_DIR:-}" ]]; then
  work=$PPA_WORK_DIR
  mkdir -p "$work"
else
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
fi

pkg=getnowhere
pristine="$work/pristine/${pkg}-${version}"
mkdir -p "$pristine/payload"
cp -a "$payload"/. "$pristine/payload/"
tar --sort=name --mtime="@$epoch" \
  --owner=0 --group=0 --numeric-owner \
  -C "$work/pristine" -cf - "${pkg}-${version}" |
  gzip -n > "$work/${pkg}_${version}.orig.tar.gz"

changelog_date=$(date -R)
for series in "${series_list[@]}"; do
  deb_version="${version}-${revision}~${series}${suffix}"
  series_root="$work/$series"
  tree="$series_root/${pkg}-${version}"
  rm -rf "$series_root"
  mkdir -p "$series_root"
  cp -a "$pristine" "$tree"
  cp -a "$work/${pkg}_${version}.orig.tar.gz" "$series_root/"
  cli_wrapper=$(dirname "$(readlink -f "$0")")/../../desktop-electron/packaging/install-cli-wrapper.sh
  [[ -f "$cli_wrapper" ]] || die "missing install-cli-wrapper.sh"
  export TREE="$tree" DEB_VERSION="$deb_version" SERIES="$series"
  export CHANGELOG_DATE="$changelog_date" ICON_PATH="${icon}"
  export APP_VERSION="$version" CLI_WRAPPER="$(readlink -f "$cli_wrapper")"
  python3 <<'PY'
import os
import shutil
from pathlib import Path

tree = Path(os.environ["TREE"])
debian = tree / "debian"
(debian / "source").mkdir(parents=True)
(debian / "source" / "format").write_text("3.0 (quilt)\n")
source = [
    "Source: getnowhere",
    "Section: net",
    "Priority: optional",
    "Maintainer: Get NowHere <packaging@localhost>",
    "Build-Depends: debhelper-compat (= 13)",
    "Standards-Version: 4.6.2",
    "Rules-Requires-Root: no",
]
homepage = os.environ.get("PPA_HOMEPAGE", "")
if homepage:
    source.append(f"Homepage: {homepage}")
binary = [
    "Package: getnowhere",
    "Architecture: amd64",
    "Depends: ${misc:Depends},",
    "         libgtk-3-0 | libgtk-3-0t64,",
    "         libnotify4,",
    "         libnss3,",
    "         libxss1,",
    "         libxtst6,",
    "         libatspi2.0-0 | libatspi2.0-0t64,",
    "         libuuid1,",
    "         libsecret-1-0 | libsecret-1-0t64,",
    "         libasound2 | libasound2t64,",
    "         xdg-utils",
    "Description: Get NowHere desktop",
    " Electron shell with a local Hyperswarm sidecar and embedded UI.",
]
(debian / "control").write_text("\n".join(source) + "\n\n" + "\n".join(binary) + "\n")
(debian / "changelog").write_text(
    "\n".join(
        [
            f"getnowhere ({os.environ['DEB_VERSION']}) {os.environ['SERIES']}; urgency=medium",
            "",
            "  * Desktop package.",
            "",
            f" -- Get NowHere <packaging@localhost>  {os.environ['CHANGELOG_DATE']}",
            "",
        ]
    )
)
(debian / "copyright").write_text(
    "\n".join(
        [
            "Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/",
            "Upstream-Name: getnowhere",
            "",
            "Files: *",
            "Copyright: Get NowHere",
            "License: unknown",
            " The upstream tree does not ship a single license file for this package.",
            "",
        ]
    )
)
(debian / "getnowhere.desktop").write_text(
    "\n".join(
        [
            "[Desktop Entry]",
            "Name=Get NowHere",
            "Exec=getnowhere",
            "Icon=getnowhere",
            "Type=Application",
            "Categories=Network;",
            "",
        ]
    )
)
icon = os.environ.get("ICON_PATH", "")
if icon:
    shutil.copyfile(icon, debian / "getnowhere.png")
    (debian / "source" / "include-binaries").write_text("debian/getnowhere.png\n")
rules = """#!/usr/bin/make -f
%:
\tdh $@

override_dh_auto_configure:
override_dh_auto_build:
override_dh_auto_test:
override_dh_dwz:
override_dh_strip:
override_dh_shlibdeps:

override_dh_auto_install:
\tinstall -d debian/getnowhere/usr/lib/getnowhere
\tcp -a payload/. debian/getnowhere/usr/lib/getnowhere/
\tfind debian/getnowhere/usr/lib/getnowhere -type d -exec chmod 755 {} +
\tfind debian/getnowhere/usr/lib/getnowhere -type f -exec chmod a+rX {} +
\tinstall -d debian/getnowhere/usr/bin
\tbash debian/install-cli-wrapper.sh @VERSION@ /usr/lib/getnowhere/getnowhere debian/getnowhere/usr/bin/getnowhere
\tinstall -d debian/getnowhere/usr/share/applications
\tinstall -m 644 debian/getnowhere.desktop debian/getnowhere/usr/share/applications/getnowhere.desktop
\tif [ -f debian/getnowhere.png ]; then \\
\t\tinstall -d debian/getnowhere/usr/share/icons/hicolor/256x256/apps; \\
\t\tinstall -m 644 debian/getnowhere.png debian/getnowhere/usr/share/icons/hicolor/256x256/apps/getnowhere.png; \\
\tfi
\tif [ -f debian/getnowhere/usr/lib/getnowhere/chrome-sandbox ]; then \\
\t\tchmod 4755 debian/getnowhere/usr/lib/getnowhere/chrome-sandbox; \\
\tfi

override_dh_missing:
\t@:
"""
wrapper = Path(os.environ["CLI_WRAPPER"])
shutil.copyfile(wrapper, debian / "install-cli-wrapper.sh")
os.chmod(debian / "install-cli-wrapper.sh", 0o755)
(debian / "rules").write_text(rules.replace("@VERSION@", os.environ["APP_VERSION"]))
os.chmod(debian / "rules", 0o755)
PY

  dest="$out_parent/$series"
  mkdir -p "$dest"
  if [[ "${PPA_PREPARE_ONLY:-0}" == 1 ]]; then
    cp "$tree/debian/changelog" "$dest/changelog"
    cp "$work/${pkg}_${version}.orig.tar.gz" "$dest/"
    continue
  fi

  command -v dpkg-buildpackage >/dev/null || die "dpkg-buildpackage is not installed"
  (
    cd "$tree"
    dpkg-buildpackage -S -d -us -uc -sa
  )
  shopt -s nullglob
  artifacts=("$series_root/${pkg}_"*)
  shopt -u nullglob
  [[ ${#artifacts[@]} -gt 0 ]] || die "dpkg-buildpackage produced no source files"
  cp "${artifacts[@]}" "$dest/"
  (
    cd "$dest"
    sha256sum "${pkg}_"* > SHA256SUMS
    cat > README.txt <<EOF
PPA source package
Version: $deb_version
Ubuntu series: $series
Source commit: $commit
EOF
  )
done
