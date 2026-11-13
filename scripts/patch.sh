#!/usr/bin/env bash
# One-shot patch bump: root `version` + package.jsons + app.json expo.version.
# Does not write ios.buildNumber (EAS remote owns it). @see docs/builds/expo-eas-ios-build.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$ROOT/version"

die() {
  echo "error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

get_field() {
  local key=$1
  local line
  line="$(grep -E "^${key}=" "$VERSION_FILE" | head -n1 || true)"
  [[ -n "$line" ]] || die "missing ${key}= in ${VERSION_FILE}"
  echo "${line#*=}"
}

set_field() {
  local key=$1
  local value=$2
  if grep -qE "^${key}=" "$VERSION_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$VERSION_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$VERSION_FILE"
  fi
}

bump_semver_patch() {
  local version=$1
  local major minor patch
  IFS=. read -r major minor patch <<<"$version"
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ && "$patch" =~ ^[0-9]+$ ]] \
    || die "invalid semver in version file: ${version}"
  echo "${major}.${minor}.$((patch + 1))"
}

set_npm_version() {
  local dir=$1
  local version=$2
  (cd "$dir" && npm version "$version" --no-git-tag-version --allow-same-version >/dev/null)
  echo "Updated ${dir}/package.json → ${version}"
}

require_cmd npm
require_cmd node
[[ -f "$VERSION_FILE" ]] || die "missing ${VERSION_FILE}"

current_version="$(get_field version)"
current_ios="$(get_field buildversionIos)"
current_android="$(get_field buildVersionAndroid)"

[[ "$current_ios" =~ ^[0-9]+$ ]] || die "invalid buildversionIos: ${current_ios}"
[[ "$current_android" =~ ^[0-9]+$ ]] || die "invalid buildVersionAndroid: ${current_android}"

new_version="$(bump_semver_patch "$current_version")"
new_ios=$((current_ios + 1))
new_android=$((current_android + 1))

set_field version "$new_version"
set_field buildversionIos "$new_ios"
set_field buildVersionAndroid "$new_android"

echo "Updated ${VERSION_FILE}:"
echo "  version ${current_version} → ${new_version}"
echo "  buildversionIos ${current_ios} → ${new_ios}"
echo "  buildVersionAndroid ${current_android} → ${new_android}"

set_npm_version "$ROOT" "$new_version"
set_npm_version "$ROOT/native-wrapper" "$new_version"
set_npm_version "$ROOT/desktop-electron" "$new_version"

node "$ROOT/native-wrapper/scripts/apply-expo-version.mjs"

echo "Patch bump completed: ${new_version} (iOS build ${new_ios}, Android build ${new_android})"
