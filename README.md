# MISSION — GitHub Pages Edition

Developer Mission Control. GitHub Pages frontend, GitHub App sign-in and a small managed Cloudflare Worker. No aaPanel, SSH, Google OAuth, shared PAT, database or self-hosted runner.

## Setup once

### 1. Register and install a GitHub App
Open https://github.com/settings/apps/new (or the organization GitHub App settings).
- App name: Mission (unique name required).
- Homepage URL: https://codelv8-org.github.io/mission/
- Callback URL: https://codelv8-org.github.io/mission/ (exact trailing slash)
- Leave device flow and installation-time user authorization disabled. Disable Webhook (no events needed).
- Keep expiring user access tokens enabled.
- Repository permissions, read-only: Metadata, Contents, Issues, Pull requests, Actions. No write or administration permissions, no organization/account permissions needed.
- Choose Only on this account if all repositories are within the app owner's account. For other owners, allow installation on other accounts and obtain the appropriate approval.
- Create app, generate a Client Secret and note its Client ID (not App ID). No private key is needed for this user authorization flow.
- Install the app on selected repositories. Every logged-in user can only access repositories allowed by both their own account and this app.

### 2. Deploy the managed API (no own server)
From the repository root on an admin computer with Node.js 22+:

    npm install
    npx wrangler login
    npm run deploy:api

Open the Worker mission-api in Cloudflare dashboard. Under Settings > Variables and Secrets configure:
- GITHUB_CLIENT_ID: GitHub App Client ID.
- GITHUB_CLIENT_SECRET: GitHub App Client Secret (secret).
- GITHUB_ALLOWED_USERS: exact GitHub usernames or numeric account IDs, comma-separated (prefer stable numeric IDs, e.g. 281293853 if that is the intended CodeLV8 account). Empty denies all.
- GITHUB_REPOSITORIES: optional comma-separated owner/repo list (max 8). If omitted, discover authorized GitHub App installations and show up to 7 most recently pushed repositories from the discovered sample.

The APP_URL variable is already set to the Pages URL. Do not put credentials in Git or in the frontend. Only the Client ID is returned from /api/config. No separate PAT or refresh-token storage. Copy the HTTPS workers.dev origin from the deployment output.

### 3. Point Pages to API
Set only apiBase in docs/config.js to the Worker HTTPS origin (no path), commit to main. Existing GitHub Pages source main /docs publishes automatically. If disabled, re-enable in Settings > Pages. Open https://codelv8-org.github.io/mission/ and use Sign in with GitHub.

## Security and scope
This uses authorization code + PKCE and state; the Worker exchanges the code with the confidential GitHub App secret. The GitHub access token is encrypted in a short-lived AES-GCM session; the browser receives only that opaque bearer session in memory, not the GitHub token. The session lasts up to one hour; refresh and local sign-out require a new sign-in. The Worker verifies /user and the explicit account allowlist before serving any data. No write access. Public Pages assets remain public; private GitHub data never enters the published repository. Use a dedicated Pages origin for production if other projects on the same github.io origin are untrusted. Protect main.

The Dashboard shows a bounded recent sample: default branch commits, recent PRs/issues/workflow runs, and up to 100 open issue/PR results per repository (PRs excluded). Auto-discovery checks up to four installations and one page of up to 100 repositories per installation, then displays seven; optional explicit list supports eight. Limits keep Worker subrequests bounded. No complete audit history, automatic AI summaries, background sync or project-editing functionality. Read-only permissions and organization approval may affect available data.

## Test and publish
`npm test` uses mocked GitHub calls; the CI workflow tests on main and PRs without deploying to external infrastructure. GitHub Pages deploys via its existing main /docs branch setting. For real testing, verify allowlisted login, unlisted account denial, missing/invalid session 401, correct repository access and logout. Cloudflare Worker and GitHub App registration must still be configured once; tests do not validate real credentials.

## Migration
The aaPanel deployment workflow and scripts have been removed. If previously configured, remove old AAPANEL_WEBHOOK_KEY and related deployment variables in GitHub, disable the Mission webhook in aaPanel, and revoke unused Google OAuth credentials or PATs if dedicated to Mission. No old hosting deployment is triggered by this repository.

References:
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- https://docs.github.com/en/rest/apps/installations
- https://developers.cloudflare.com/workers/configuration/secrets/
