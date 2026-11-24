#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(id -u) -eq 0 ]] || { echo "Run with sudo."; exit 1; }
[[ $# -eq 1 && -f "$1" ]] || { echo "Usage: sudo bash deploy/setup-aapanel.sh /path/to/mission-deploy.pub"; exit 1; }
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
node_bin="$(command -v node || true)"
[[ -n "$node_bin" && "$("$node_bin" -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ]] || { echo "Node.js 22+ must be on PATH (sudo may reset PATH)."; exit 1; }
node_dir="$(dirname "$node_bin")"
[[ "$node_dir" =~ ^/[a-zA-Z0-9_./-]+$ && -x "$node_dir/npm" ]] || { echo "Node and npm must be installed together in a standard path."; exit 1; }
# Root-controlled binary directories only; never use a deploy-user-writable Node install.
for cmd in git tar curl flock sudo visudo systemctl ssh-keygen; do command -v "$cmd" >/dev/null || { echo "Missing command: $cmd"; exit 1; }; done
[[ -x /usr/bin/systemctl ]] || { echo "This installer targets Ubuntu/Debian with /usr/bin/systemctl."; exit 1; }
ssh-keygen -lf "$1" >/dev/null
read -r keytype keydata _ < "$1"
[[ "$keytype" == ssh-ed25519 && "$keydata" =~ ^[A-Za-z0-9+/=]+$ ]] || { echo "Use a dedicated Ed25519 public key."; exit 1; }
id mission-deploy >/dev/null 2>&1 || useradd --create-home --home-dir /var/lib/mission-deploy --shell /bin/bash mission-deploy
home="$(getent passwd mission-deploy | cut -d: -f6)"
[[ "$home" == /var/lib/mission-deploy ]] || { echo "Unexpected existing deploy-user home."; exit 1; }
install -d -o mission-deploy -g mission-deploy -m 750 /opt/mission /opt/mission/releases
install -d -o root -g root -m 700 /etc/mission
if [[ ! -e /etc/mission/mission.env ]]; then
  install -o root -g root -m 600 "$here/mission.env.example" /etc/mission/mission.env
fi
printf 'NODE_DIR=%s\n' "$node_dir" > /etc/mission/deploy.conf
chmod 644 /etc/mission/deploy.conf
chmod 755 /etc/mission
install -o root -g root -m 755 "$here/mission-deploy.sh" /usr/local/sbin/mission-deploy
install -d -o mission-deploy -g mission-deploy -m 700 "$home/.ssh"
auth="$home/.ssh/authorized_keys"
touch "$auth"; chown mission-deploy:mission-deploy "$auth"; chmod 600 "$auth"
line="restrict,command=\"/usr/local/sbin/mission-deploy\" $keytype $keydata mission-github-actions"
if grep -Fq "$keydata" "$auth"; then
  grep -Fxq "$line" "$auth" || { echo "Existing key has different restrictions; use a new dedicated key."; exit 1; }
else
  printf '%s\n' "$line" >> "$auth"
fi
cat > /etc/systemd/system/mission.service <<EOF
[Unit]
Description=Mission Developer Workspace
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=mission-deploy
Group=mission-deploy
WorkingDirectory=/opt/mission/current
EnvironmentFile=/etc/mission/mission.env
Environment=NODE_ENV=production
ExecStart=$node_bin /opt/mission/current/server/index.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
tmp="$(mktemp)"
printf '%s\n' 'mission-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart mission.service, /usr/bin/systemctl stop mission.service' > "$tmp"
visudo -cf "$tmp" >/dev/null
install -o root -g root -m 440 "$tmp" /etc/sudoers.d/mission-deploy
rm -f "$tmp"
systemctl daemon-reload
systemctl enable mission.service
echo "Setup complete. Edit /etc/mission/mission.env, then configure GitHub Actions and aaPanel reverse proxy."
echo "SSH host key fingerprint (verify out of band):"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
