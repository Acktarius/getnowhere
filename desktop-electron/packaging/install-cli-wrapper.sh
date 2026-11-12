#!/bin/bash
# /usr/bin entry: bare version, then the Electron binary.
# Electron consumes -v/--version before app code. @see docs/builds/github-pages-and-desktop.md
set -euo pipefail

version=${1:?version}
app=${2:?app path}
dest=${3:?dest}

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "bad version: $version" >&2
  exit 1
}
[[ "$app" == /* && "$app" != *"'"* ]] || {
  echo "bad app path: $app" >&2
  exit 1
}

install -d -m755 "$(dirname "$dest")"
cat > "$dest" << EOF
#!/bin/sh
case "\${1-}" in
  -v|--version)
    printf '%s\n' '${version}'
    exit 0
    ;;
esac
exec '${app}' "\$@"
EOF
chmod 755 "$dest"
