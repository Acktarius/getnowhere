#!/usr/bin/env bash
# Load PPA upload keys from a dotenv file without evaluating the values.

load_ppa_env() {
  local file=$1
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line#"${line%%[![:space:]]*}"}
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    local key=${BASH_REMATCH[1]}
    local value=${BASH_REMATCH[2]}
    case "$key" in
      PPA_* | GITHUB_TOKEN | GH_TOKEN | DEBFULLNAME | DEBEMAIL) ;;
      *) continue ;;
    esac
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value=${value:1:${#value}-2}
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value=${value:1:${#value}-2}
    fi
    [[ -z "${!key:-}" ]] || continue
    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$file"
}
