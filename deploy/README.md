# aaPanel deployment using aaPanel Auto Deploy v4

## Requirements
Ubuntu/Debian, systemd, Node.js 22+ and npm in an administrator-controlled PATH, git, curl, sudo, util-linux. Port 3107 must be free. Install the aaPanel Webhook plugin from App Store. GitHub-hosted runners must be able to reach the webhook via HTTPS. If LAN-only, use a secured dedicated endpoint/network path; do not expose the panel admin console or install a public-repo runner on production.

## 1. One-time host setup

    git clone https://github.com/codelv8-org/mission.git
    cd mission
    sudo bash deploy/setup-aapanel.sh
    sudo nano /etc/mission/mission.env

Review scripts before running as root. The installer prepares /opt/mission, a non-root deployment/service user and systemd. It does not install SSH keys. If sudo resets PATH, use a root-controlled Node directory explicitly via sudo env PATH=/path/to/node/bin:/usr/sbin:/usr/bin:/sbin:/bin bash deploy/setup-aapanel.sh.

Fill APP_ORIGIN (e.g. https://mission.codelv8.com; exact HTTPS origin without trailing slash), GOOGLE_CLIENT_ID, GOOGLE_ALLOWED_EMAILS (or GOOGLE_ALLOWED_SUBS), GITHUB_TOKEN (read-only fine-grained PAT), GITHUB_REPOSITORIES. Keep secrets only in the root-owned env file (0600). Add APP_ORIGIN to Authorized JavaScript origins of the existing Google OAuth web client. Do not paste secrets into chat or commit them.

## 2. aaPanel webhook
In App Store > Webhook > Add, create a hook named Mission Auto Deploy. In its command field use the following fixed command, assuming aaPanel executes hooks as root:

    /usr/sbin/runuser -u mission-deploy -- /usr/local/sbin/mission-deploy

Check the actual plugin execution user; if already mission-deploy, use /usr/local/sbin/mission-deploy directly. If neither, configure a narrowly scoped approved local privilege mechanism with your admin; do not grant broad sudo to www. Do not put user-supplied request parameters into the command. Copy the hook's access key from View key, not the entire URL. The action POSTs to BASE_URL/hook?access_key=KEY. Use an exact reachable HTTPS base URL without trailing slash, login path, or query. Ideally publish only /hook on a dedicated TLS endpoint with rate limiting; restrict administration separately. Avoid access logs that record the key. The plugin may execute asynchronously or report HTTP success before its script is complete.

## 3. GitHub settings
https://github.com/codelv8-org/mission/settings/secrets/actions

Repository variables:
- AAPANEL_PANEL_URL: webhook HTTPS base URL, e.g. https://hooks.example.com (or include the actual port if required).
- MISSION_URL: optional but recommended, actual HTTPS application origin without trailing slash; enables end-to-end revision check.

Repository secret:
- AAPANEL_WEBHOOK_KEY: dedicated hook access key.

No SSH key, host, known_hosts, or GitHub PAT is required by the deployment workflow. The app's GitHub PAT is still required on the host. The workflow pins tunnaduong/aapanel-deploy-action v4 to its reviewed SHA; it uses needs: test instead of granting the third-party action additional GitHub token permissions. ntfy is disabled.

## 4. Website
Create DNS and an HTTPS reverse proxy in aaPanel for the Mission domain pointing to http://127.0.0.1:3107. Disable proxy caching, set proxy_read_timeout 120s, and use systemd only (no duplicate Node Manager process). Do not open port 3107 or publish /opt/mission as a document root.

    location / {
        proxy_pass http://127.0.0.1:3107;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_cache off;
    }

## 5. Deploy
Open https://github.com/codelv8-org/mission/actions and run Test and deploy Mission to aaPanel on main. The deploy job is skipped if AAPANEL_PANEL_URL is unset; no deployment on pull requests. The Marketplace action sends only a webhook trigger, not the CI commit SHA. The fixed host script fetches current main under a lock, tests that revision, installs a fresh release, switches the symlink, restarts systemd and checks the exact local revision; it rolls back on failure. A newer main may be deployed instead of the triggering CI SHA; it is tested again on the host, and the optional public revision check will report a mismatch. The hook response alone does not prove successful deployment. Check hook logs and the app's /healthz; the first deployment has no prior release for rollback.

    sudo systemctl status mission.service
    curl -fsS http://127.0.0.1:3107/healthz
    sudo journalctl -u mission.service -n 60 --no-pager

Verify Google sign-in for allowed and denied accounts, missing token 401, and GitHub data. Health checks only prove service startup and revision, not live credential validity. Periodically clean old unused releases and protect main. Later environment changes require a service restart; pushes deploy automatically.

If migrating from the old SSH deployment, rerun setup, remove only the old managed mission-github-actions public key from the deployment user's authorized_keys if present, and delete unused DEPLOY_SSH_KEY/DEPLOY_KNOWN_HOSTS secrets and DEPLOY_HOST/DEPLOY_PORT variables. Disable GitHub Pages if still enabled.

Reference: https://github.com/marketplace/actions/aapanel-auto-deploy
