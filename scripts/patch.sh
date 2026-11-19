#!/usr/bin/env bash
# One-shot patch bump: root `version` + package.jsons + app.json expo.version.
# Also refreshes heightAtVersion from a known Conceal daemon getheight.
# Does not write ios.buildNumber (EAS remote owns it). @see docs/builds/expo-eas-ios-build.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$ROOT/version"
DAEMON_HEIGHT_URL="https://conceal.nodesandbits.tech/getheight"

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

# Conceal getheight: {"height":N,"status":"OK"}. Fail before any version write.
fetch_chain_height() {
  local body height
  body="$(curl -fsS --max-time 15 "$DAEMON_HEIGHT_URL")" \
    || die "could not fetch chain height from ${DAEMON_HEIGHT_URL}"
  height="$(printf '%s' "$body" | node -e '
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      let data;
      try { data = JSON.parse(raw); } catch { process.exit(1); }
      const height = parseInt(String(data && data.height), 10);
      if (!data || data.status !== "OK" || !Number.isFinite(height) || height <= 0) {
        process.exit(1);
      }
      process.stdout.write(String(height));
    });
  ')" || die "invalid getheight response from ${DAEMON_HEIGHT_URL}: ${body}"
  echo "$height"
}

require_cmd npm
require_cmd node
require_cmd curl
[[ -f "$VERSION_FILE" ]] || die "missing ${VERSION_FILE}"

current_version="$(get_field version)"
current_ios="$(get_field buildversionIos)"
current_android="$(get_field buildVersionAndroid)"
current_height="$(get_field heightAtVersion)"

[[ "$current_ios" =~ ^[0-9]+$ ]] || die "invalid buildversionIos: ${current_ios}"
[[ "$current_android" =~ ^[0-9]+$ ]] || die "invalid buildVersionAndroid: ${current_android}"
[[ "$current_height" =~ ^[0-9]+$ ]] || die "invalid heightAtVersion: ${current_height}"

new_height="$(fetch_chain_height)"
[[ "$new_height" =~ ^[0-9]+$ && "$new_height" -gt 0 ]] \
  || die "invalid fetched height: ${new_height}"
[[ "$new_height" -ge "$current_height" ]] \
  || die "fetched height ${new_height} is below heightAtVersion ${current_height}"

new_version="$(bump_semver_patch "$current_version")"
new_ios=$((current_ios + 1))
new_android=$((current_android + 1))

set_field version "$new_version"
set_field buildversionIos "$new_ios"
set_field buildVersionAndroid "$new_android"
set_field heightAtVersion "$new_height"

echo "Updated ${VERSION_FILE}:"
echo "  version ${current_version} → ${new_version}"
echo "  buildversionIos ${current_ios} → ${new_ios}"
echo "  buildVersionAndroid ${current_android} → ${new_android}"
echo "  heightAtVersion ${current_height} → ${new_height}"

set_npm_version "$ROOT" "$new_version"
set_npm_version "$ROOT/native-wrapper" "$new_version"
set_npm_version "$ROOT/desktop-electron" "$new_version"

node "$ROOT/native-wrapper/scripts/apply-expo-version.mjs"

echo "Patch bump completed: ${new_version} (iOS build ${new_ios}, Android build ${new_android}, height ${new_height})"
