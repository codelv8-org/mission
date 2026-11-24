# aaPanel production deployment

## Prerequisites
Ubuntu/Debian systemd server; Node.js 22+ and npm on an administrator-controlled PATH (aaPanel Node installation is fine if both binaries are in the same root-controlled directory); git, curl, openssh-server, sudo, util-linux. Port 3107 must be free. This deployment uses a **publicly reachable SSH endpoint** for the GitHub-hosted runner; do not expose a LAN-only machine merely to use this workflow. If behind LAN/NAT, use a separate secured network path or a dedicated isolated runner for a private repository, not a public repo runner on production.

## 1. Dedicated deployment key
On your admin PC, generate a new key with no passphrase (CI-only):

    ssh-keygen -t ed25519 -f mission-deploy -C mission-github-actions -N ""

Copy only `mission-deploy.pub` to your server using your existing administrative SSH access. Keep the private key secret; it is used only by GitHub Actions.

## 2. One-time server setup
Run from a fresh clone in your admin account (do not run on an existing application directory):

    git clone https://github.com/codelv8-org/mission.git
    cd mission
    sudo bash deploy/setup-aapanel.sh /absolute/path/to/mission-deploy.pub
    sudo nano /etc/mission/mission.env

If sudo resets PATH, specify the root-controlled aaPanel Node installation directory explicitly using sudo env PATH=/path/to/node/bin:/usr/sbin:/usr/bin:/sbin:/bin bash deploy/setup-aapanel.sh ... . Verify Node.js 22+ and the port. Fill the actual APP_ORIGIN (exact HTTPS origin without trailing slash), Google client ID, explicit allowed emails (or stable Google subject IDs), read-only PAT, and selected repositories. No production config belongs in Git. The setup script installs a dedicated systemd service, a restricted SSH key, and narrowly scoped sudo rules for restarting/stopping only mission.service. Review scripts before running as root. The application is installed in /opt/mission, outside any web document root. Service is enabled but starts only on first successful deployment.

## 3. GitHub Actions settings
Open https://github.com/codelv8-org/mission/settings/secrets/actions

Repository variables:
- DEPLOY_HOST: actual reachable SSH hostname or IPv4 address, not an HTTPS URL. If using Cloudflare DNS, the SSH hostname must resolve to a reachable SSH endpoint.
- DEPLOY_PORT: optional, defaults to 22.

Repository secrets:
- DEPLOY_SSH_KEY: contents of your dedicated private Ed25519 key (including BEGIN/END lines).
- DEPLOY_KNOWN_HOSTS: pinned SSH known_hosts entry for the exact host and port.

Obtain candidate known_hosts data on your admin PC using `ssh-keyscan -t ed25519 -p PORT HOST`. Before saving it, compare its fingerprint (save candidate to a file and use ssh-keygen -lf FILE) against the actual server fingerprint printed by the installer or `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Do not blindly trust an unverified keyscan. Never paste the private SSH key or PAT into chat.

## 4. aaPanel
Create DNS and a website/reverse proxy for your actual domain, enable SSL, enforce HTTPS, and proxy all requests to http://127.0.0.1:3107 with caching disabled. Example location settings if manually editing the existing aaPanel reverse proxy config (do not duplicate a location):

    location / {
        proxy_pass http://127.0.0.1:3107;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_cache off;
    }

The Node listener is local only. Do not open port 3107 externally. Do not configure aaPanel Node Manager to launch a second process; systemd manages the application.

## 5. First deployment
Open https://github.com/codelv8-org/mission/actions and run **Test and deploy Mission to aaPanel** against main. The deploy job is skipped until DEPLOY_HOST is configured. PRs run tests on GitHub-hosted runners and cannot deploy. On main, tests pass first, then the runner sends only the current main SHA to a restricted SSH command. The host fetches that exact main revision, installs dependencies and reruns tests in a new release directory, switches the current symlink, restarts the service, checks /healthz and restores the previous release if it fails. Retained releases need periodic disk cleanup; never delete the current/previous release. Protect main and restrict who can modify workflows or push to main. The first deployment cannot roll back to an earlier release that does not exist.

Check on the host:

    sudo systemctl status mission.service
    curl -fsS http://127.0.0.1:3107/healthz
    sudo journalctl -u mission.service -n 60 --no-pager

Then open your HTTPS domain. Verify allowed Google account, denied unlisted account, unauthenticated /api/dashboard = 401, and GitHub results. The health endpoint only proves that the service started with syntactically valid configuration; it does not validate live GitHub or Google credentials.

For later secret changes, edit /etc/mission/mission.env then sudo systemctl restart mission.service. Future pushes automatically deploy. Do not use root SSH for the workflow.
