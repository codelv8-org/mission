#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$(id -un)" == mission-deploy ]] || { echo "Run only as mission-deploy."; exit 1; }
[[ $# -eq 0 ]] || { echo "No command arguments accepted."; exit 2; }
# Root-owned installer configuration; no user-supplied shell commands.
source /etc/mission/deploy.conf
export PATH="$NODE_DIR:/usr/bin:/bin"
base=/opt/mission
gitdir="$base/repository.git"
exec 9>"$base/.deploy.lock"
flock -w 120 9
if [[ ! -d "$gitdir" ]]; then git init --bare "$gitdir"; fi
git --git-dir="$gitdir" fetch --no-tags https://github.com/codelv8-org/mission.git '+refs/heads/main:refs/heads/main'
sha="$(git --git-dir="$gitdir" rev-parse refs/heads/main)"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid main revision."; exit 1; }
release="$(mktemp -d "$base/releases/$sha.XXXXXX")"
previous="$(readlink -f "$base/current" || true)"
# No production secrets are present in the release or passed to npm.
git --git-dir="$gitdir" archive "$sha" | tar -xf - -C "$release"
cd "$release"
if [[ -f package-lock.json ]]; then npm ci --ignore-scripts --no-audit --no-fund; else npm install --ignore-scripts --no-audit --no-fund; fi
npm test
printf '%s\n' "$sha" > "$release/.mission-release"
chmod 750 "$release"
switch_to(){
  local target="$1"
  ln -s "$target" "$base/.current.$$"
  mv -Tf "$base/.current.$$" "$base/current"
}
healthy(){
  local expected="${1:-}" response
  for ((i=0;i<20;i++)); do
    if /usr/bin/systemctl is-active --quiet mission.service && response="$(curl --fail --silent --max-time 2 http://127.0.0.1:3107/healthz 2>/dev/null)"; then
      if [[ -n "$expected" && "$response" == *"\"revision\":\"$expected\""* ]]; then return 0; fi
      if [[ -z "$expected" && "$response" == *'"status":"ok"'* ]]; then return 0; fi
    fi
    sleep 1
  done
  return 1
}
switch_to "$release"
if sudo -n /usr/bin/systemctl restart mission.service && healthy "$sha"; then
  echo "Deployed $sha; local health check passed."
else
  echo "Deployment failed; restoring previous release."
  if [[ -n "$previous" && -d "$previous" && "$previous" == "$base"/releases/* ]]; then
    switch_to "$previous"
    sudo -n /usr/bin/systemctl restart mission.service
    previous_sha="$(cat "$previous/.mission-release" 2>/dev/null || true)"
    healthy "$previous_sha" || echo "Previous release health check failed; inspect service."
  else
    sudo -n /usr/bin/systemctl stop mission.service || true
    rm -f "$base/current"
  fi
  exit 1
fi
