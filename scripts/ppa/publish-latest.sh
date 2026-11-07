#!/usr/bin/env bash
# Download unsigned PPA source artifacts from a workflow run,
# sign them for the local Launchpad account, and dput them.
# @see docs/builds/ppa-source.md
set -euo pipefail

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
usage: publish-latest.sh [--dry-run] [--run RUN_ID] [--from DIR] [--series jammy,noble,resolute]

Downloads the ppa-source-* artifacts from a successful PPA source packages run.
The default run is the latest success. --run selects one run.
--from DIR uses an already downloaded source directory.
The script then rewrites the maintainer from .env, signs the source, and runs dput.
EOF
}

root=$(cd "$(dirname "$0")/../.." && pwd)
# shellcheck source=load-env.sh
source "$root/scripts/ppa/load-env.sh"
load_ppa_env "$root/.env"

dry_run=0
from_dir=""
run_id=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry_run=1; shift ;;
    --run)
      [[ $# -ge 2 ]] || die "--run needs a workflow run id"
      run_id=$2
      shift 2
      ;;
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

artifact_series() {
  case "$1" in
    22 | 22.04 | jammy) printf '%s\n' jammy ;;
    24 | 24.04 | noble) printf '%s\n' noble ;;
    26 | 26.04 | resolute) printf '%s\n' resolute ;;
    *) return 1 ;;
  esac
}

copy_source_files() {
  local dir=$1
  local file base
  if [[ -f "$dir/SHA256SUMS" ]]; then
    (cd "$dir" && sha256sum -c SHA256SUMS) || die "source checksum mismatch"
  fi
  shopt -s nullglob
  for file in "$dir"/*.dsc "$dir"/*.orig.tar.* "$dir"/*.debian.tar.* "$dir"/*_source.changes "$dir"/*_source.buildinfo; do
    base=$(basename "$file")
    if [[ -f "$incoming/$base" ]]; then
      cmp -s "$file" "$incoming/$base" || die "source files from different artifacts disagree"
      continue
    fi
    cp "$file" "$incoming/$base"
  done
  shopt -u nullglob
}

incoming=${PPA_DIST_DIR:-$root/dist/ppa}/incoming
out=${PPA_DIST_DIR:-$root/dist/ppa}
rm -rf "$out"
mkdir -p "$incoming"

if [[ -n "$from_dir" ]]; then
  from_dir=$(cd "$from_dir" && pwd)
  cp -a "$from_dir"/. "$incoming/"
else
  [[ -z "$run_id" || "$run_id" =~ ^[0-9]+$ ]] || die "--run must be a numeric workflow run id"
  [[ -n "${PPA_GITHUB_REPO:-}" ]] || die "set PPA_GITHUB_REPO in .env (<owner>/<name>)"
  [[ "$PPA_GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "PPA_GITHUB_REPO must look like <owner>/<name>"
  declare -A seen_series=()
  wanted_series=()
  for raw in "${series_allow[@]}"; do
    [[ -n "$raw" ]] || continue
    name=$(artifact_series "$raw") || die "unknown Ubuntu series"
    [[ -n "${seen_series[$name]:-}" ]] && continue
    seen_series[$name]=1
    wanted_series+=("$name")
  done
  [[ ${#wanted_series[@]} -gt 0 ]] || die "PPA_SERIES is empty"
  command -v gh >/dev/null 2>&1 || die "install the gh CLI and log in before downloading workflow artifacts"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  if [[ -z "$run_id" ]]; then
    run_id=$(gh run list --repo "$PPA_GITHUB_REPO" --workflow ppa-source.yml --status success --limit 1 --json databaseId --jq '.[0].databaseId') \
      || die "workflow run request failed"
  fi
  [[ "$run_id" =~ ^[0-9]+$ ]] || die "no successful PPA source workflow run"
  for name in "${wanted_series[@]}"; do
    gh run download "$run_id" --repo "$PPA_GITHUB_REPO" --name "ppa-source-$name" --dir "$tmp/$name" \
      || die "workflow artifact download failed"
    copy_source_files "$tmp/$name"
  done
fi

mapfile -t dsc_files < <(find "$incoming" -maxdepth 1 -name '*.dsc' | sort)
[[ ${#dsc_files[@]} -gt 0 ]] || die "workflow artifacts have no PPA source package"

if [[ "$dry_run" -eq 1 ]]; then
  printf 'dry-run: %s source description(s) in %s\n' "${#dsc_files[@]}" "$incoming"
  exit 0
fi

mapfile -t changes_files < <(find "$incoming" -maxdepth 1 -name '*_source.changes' | sort)
[[ ${#changes_files[@]} -gt 0 ]] || die "workflow artifacts have no source changes file"
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
