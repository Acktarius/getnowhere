#!/usr/bin/env bash
# Download the unsigned PPA source package from the latest GitHub release,
# sign it for the local Launchpad account, and dput it.
# @see docs/builds/ppa-source.md
set -euo pipefail

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
usage: publish-latest.sh [--dry-run] [--from DIR] [--series jammy,noble,resolute]

Downloads *.dsc and the matching tarballs from the latest GitHub release,
rewrites the maintainer from .env, signs the source, and runs dput.
--from DIR uses an already downloaded source directory instead of GitHub.
EOF
}

root=$(cd "$(dirname "$0")/../.." && pwd)
# shellcheck source=load-env.sh
source "$root/scripts/ppa/load-env.sh"
load_ppa_env "$root/.env"

dry_run=0
from_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry_run=1; shift ;;
    --from)
      [[ $# -ge 2 ]] || die "--from needs a path"
      from_dir=$2
      shift 2
      ;;
    --series)
      [[ $# -ge 2 ]] || die "--series needs a value"
      PPA_SERIES=$2
      shift 2
      ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown argument" ;;
  esac
done

if [[ "$dry_run" -eq 0 ]]; then
  [[ -n "${PPA_TARGET:-}" ]] || die "set PPA_TARGET in .env (ppa:<user>/<archive>)"
  [[ "$PPA_TARGET" =~ ^ppa:[A-Za-z0-9][A-Za-z0-9+-]*/[A-Za-z0-9][A-Za-z0-9+.-]+$ ]] || die "PPA_TARGET must look like ppa:<user>/<archive>"
  [[ -n "${PPA_DEBFULLNAME:-}" && -n "${PPA_DEBEMAIL:-}" ]] || die "set PPA_DEBFULLNAME and PPA_DEBEMAIL in .env"
  [[ -n "${PPA_GPG_KEY_ID:-}" ]] || die "set PPA_GPG_KEY_ID in .env"
  [[ "$PPA_DEBFULLNAME" != *$'\n'* && "$PPA_DEBFULLNAME" != *"<"* && "$PPA_DEBFULLNAME" != *">"* ]] || die "maintainer name is invalid"
  email_re='^[^[:space:]<>]+@[^[:space:]<>]+$'
  [[ "$PPA_DEBEMAIL" =~ $email_re ]] || die "maintainer email is invalid"
  command -v dput >/dev/null || die "dput is not installed"
  command -v dpkg-source >/dev/null || die "dpkg-source is not installed"
  command -v dpkg-buildpackage >/dev/null || die "dpkg-buildpackage is not installed"
  export DEBFULLNAME="$PPA_DEBFULLNAME" DEBEMAIL="$PPA_DEBEMAIL"
fi

series_raw=${PPA_SERIES:-jammy noble resolute}
series_raw=${series_raw//,/ }
read -r -a series_allow <<< "$series_raw"

allowed_series() {
  local candidate=$1
  local item
  for item in "${series_allow[@]}"; do
    [[ "$item" == "$candidate" ]] && return 0
  done
  return 1
}

series_of() {
  case "$1" in
    *~jammy*) printf '%s\n' jammy ;;
    *~noble*) printf '%s\n' noble ;;
    *~resolute*) printf '%s\n' resolute ;;
    *) return 1 ;;
  esac
}

incoming=${PPA_DIST_DIR:-$root/dist/ppa}/incoming
out=${PPA_DIST_DIR:-$root/dist/ppa}
rm -rf "$out"
mkdir -p "$incoming"

if [[ -n "$from_dir" ]]; then
  from_dir=$(cd "$from_dir" && pwd)
  cp -a "$from_dir"/. "$incoming/"
else
  [[ -n "${PPA_GITHUB_REPO:-}" ]] || die "set PPA_GITHUB_REPO in .env (<owner>/<name>)"
  [[ "$PPA_GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "PPA_GITHUB_REPO must look like <owner>/<name>"
  command -v curl >/dev/null || die "curl is not installed"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  hdr=(-H "Accept: application/vnd.github+json" -H "User-Agent: ppa-source")
  token=${GITHUB_TOKEN:-${GH_TOKEN:-}}
  if [[ -n "$token" ]]; then
    [[ "$token" != *[[:space:]]* ]] || die "GITHUB_TOKEN is invalid"
    hdr+=(-H "Authorization: Bearer ${token}")
  fi
  curl -fsSL "${hdr[@]}" -o "$tmp/release.json" \
    "https://api.github.com/repos/${PPA_GITHUB_REPO}/releases/latest" \
    || die "GitHub release request failed"
  python3 - "$tmp/release.json" "$tmp/assets.tsv" "${token:+token}" <<'PY'
import json
import re
import sys
from pathlib import Path

release = json.loads(Path(sys.argv[1]).read_text())
use_api = len(sys.argv) > 3 and sys.argv[3] == "token"
wanted = re.compile(
    r"(?:\.dsc|_source\.changes|_source\.buildinfo|\.orig\.tar\.[A-Za-z0-9]+|\.debian\.tar\.[A-Za-z0-9]+|SHA256SUMS)$"
)
lines = []
for asset in release.get("assets") or []:
    name = asset.get("name") or ""
    if "/" in name or not wanted.search(name):
        continue
    url = asset.get("url") if use_api else asset.get("browser_download_url")
    if not name or not isinstance(url, str) or not url.startswith("https://"):
        continue
    lines.append(f"{name}\t{url}")
if not any(line.split("\t", 1)[0].endswith(".dsc") for line in lines):
    raise SystemExit("latest release has no PPA source package")
Path(sys.argv[2]).write_text("\n".join(lines) + "\n")
PY
  while IFS=$'\t' read -r name url; do
    [[ -n "$name" ]] || continue
    [[ "$name" =~ ^[A-Za-z0-9._+~-]+$ ]] || die "release asset name is not usable"
    [[ "$url" == https://* ]] || die "source download failed"
    if [[ -n "$token" ]]; then
      curl -fsSL -H "Accept: application/octet-stream" -H "Authorization: Bearer ${token}" \
        -o "$incoming/$name" "$url" || die "source download failed"
    else
      curl -fsSL -o "$incoming/$name" "$url" || die "source download failed"
    fi
  done < "$tmp/assets.tsv"
fi

if [[ -f "$incoming/SHA256SUMS" ]]; then
  (cd "$incoming" && sha256sum -c SHA256SUMS) || die "source checksum mismatch"
fi
mapfile -t dsc_files < <(find "$incoming" -maxdepth 1 -name '*.dsc' | sort)
[[ ${#dsc_files[@]} -gt 0 ]] || die "latest release has no PPA source package"

if [[ "$dry_run" -eq 1 ]]; then
  printf 'dry-run: %s source description(s) in %s\n' "${#dsc_files[@]}" "$incoming"
  exit 0
fi

mapfile -t changes_files < <(find "$incoming" -maxdepth 1 -name '*_source.changes' | sort)
[[ ${#changes_files[@]} -gt 0 ]] || die "latest release has no source changes file"
changelog_date=$(date -R)

for changes_file in "${changes_files[@]}"; do
  series=$(series_of "$(basename "$changes_file")") || die "source changes file has no Ubuntu series"
  allowed_series "$series" || continue
  base=${changes_file%_source.changes}
  dsc=${base}.dsc
  [[ -f "$dsc" ]] || die "source package is missing a dsc"
  orig_name=$(awk '/\.orig\.tar\./ { print $NF; exit }' "$dsc")
  [[ -n "$orig_name" && -f "$incoming/$orig_name" ]] || die "source package is missing an orig tarball"
  shopt -s nullglob
  debian_tars=("${base}.debian.tar."*)
  shopt -u nullglob
  [[ ${#debian_tars[@]} -eq 1 ]] || die "source package is missing a debian tarball"

  stage=${PPA_WORK_DIR:-$(mktemp -d)}/$series
  rm -rf "$stage"
  mkdir -p "$stage"
  cp "$dsc" "$incoming/$orig_name" "${debian_tars[0]}" "$stage/"
  (
    cd "$stage"
    dpkg-source --no-check -x "$(basename "$dsc")" src
  )
  export CHANGELOG="$stage/src/debian/changelog" CONTROL="$stage/src/debian/control"
  export CHANGELOG_DATE="$changelog_date"
  python3 <<'PY'
import os
import re
from pathlib import Path

changelog = Path(os.environ["CHANGELOG"])
control = Path(os.environ["CONTROL"])
lines = changelog.read_text().splitlines()
if not lines:
    raise SystemExit("changelog is empty")
header = lines[0]
suffix = os.environ.get("PPA_UPLOAD_SUFFIX", "")
revision = os.environ.get("PPA_DEBIAN_REVISION", "")
if suffix:
    header, count = re.subn(
        r"~([a-z]+)\d+",
        lambda match: f"~{match.group(1)}{suffix}",
        header,
        count=1,
    )
    if count != 1:
        raise SystemExit("changelog series suffix was not updated")
if revision:
    header, count = re.subn(rf"-(\d+)~", f"-{revision}~", header, count=1)
    if count != 1:
        raise SystemExit("changelog revision was not updated")
lines[0] = header
trailer = f" -- {os.environ['DEBFULLNAME']} <{os.environ['DEBEMAIL']}>  {os.environ['CHANGELOG_DATE']}"
for index in range(len(lines) - 1, -1, -1):
    if lines[index].startswith(" -- "):
        lines[index] = trailer
        break
else:
    raise SystemExit("changelog has no maintainer trailer")
changelog.write_text("\n".join(lines) + "\n")
maintainer = f"Maintainer: {os.environ['DEBFULLNAME']} <{os.environ['DEBEMAIL']}>"
text, count = re.subn(r"(?m)^Maintainer:.*$", maintainer, control.read_text(), count=1)
if count != 1:
    raise SystemExit("control maintainer was not updated")
control.write_text(text)
PY
  (
    cd "$stage/src"
    dpkg-buildpackage -S -d -sa -k"$PPA_GPG_KEY_ID"
  )
  dest="$out/$series"
  mkdir -p "$dest"
  shopt -s nullglob
  built=("$stage"/getnowhere_*)
  shopt -u nullglob
  [[ ${#built[@]} -gt 0 ]] || die "signed source package was not produced"
  cp "${built[@]}" "$dest/"
  signed=$(find "$dest" -maxdepth 1 -name '*_source.changes' | sort | tail -1)
  [[ -n "$signed" ]] || die "signed source changes file is missing"
  printf 'upload %s\n' "$(basename "$signed")"
  dput "$PPA_TARGET" "$signed"
done
