# MISSION — GitHub Pages PAT Edition (v0.4.2)

Developer Mission Control. **GitHub only**: GitHub Pages hosts the frontend; the browser connects directly to the official GitHub REST API using the user's fine-grained personal access token. No backend, Worker, aaPanel, OAuth app, database, external dependencies or external deployment.

## Start
1. Generate a fine-grained PAT: https://github.com/settings/personal-access-tokens/new .
   - Token name: Mission Read Only.
   - Expiration: 30–90 days (or shorter).
   - Resource owner: the account or organization whose private repositories you want to monitor.
   - Repository access: Only select repositories; choose the intended repositories.
   - Repository permissions (read-only): Metadata (mandatory), Contents, Issues, Pull requests, Actions. No other permissions; no write access. Organization approval may be needed.
2. Open https://codelv8-org.github.io/mission/ . Verify the URL before entering a credential. Enter the PAT directly on the Mission page, not into chat, GitHub files, Actions secrets, or a URL. Click Connect GitHub.
3. Mission verifies /user and discovers repositories through /user/repos. It initially monitors up to eight recently pushed repositories; use Manage repositories to choose up to 20 or add an accessible owner/repo manually. Select Apply & load.

No build step or setup variables. The Pages publication source is main /docs. If Pages was disabled, enable it in Settings > Pages.

## Visual design
Vibrant Claymorphism + Block-based Bento, guided by [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) and the approved visual concept. Opaque clay cards, colorful KPI blocks, compact project timeline and daily activity pair, four analysis cards on wide screens. No external dependencies or build step. See [design system](design-system/mission/MASTER.md).

## Features
- Dashboard (analytics bento): project/day activity matrix with event drill-down, daily stacked activity, priority distribution, most-active projects, attention queue, and latest workflow signals. Uses only the already loaded sample; no extra API calls. The 7/30-day view uses UTC calendar days ending at the snapshot time; issue metrics are the current open-issue snapshot. Asterisks and question marks flag incomplete sections; no record is not proof of inactivity. PR, issue and workflow dates reflect latest updates of loaded records, not a complete event history or milestone plan.
- Overview, Activity Timeline (7/30 days), Priority Queue (labels P0–P3 and blocked), Repository Portfolio.
- Automatic discovery of up to five pages (500 results); manual additions verify access with GitHub.
- User identity checked on connection and every dashboard refresh.
- Bounded recent samples: 10 default-branch commits, 30 recently updated issue/PR results excluding PRs, 10 recent PRs, 5 workflow runs, and 100 open issue/PR results excluding PRs per repository. These are not complete counts/audit histories. Failed sections are shown explicitly.
- GitHub API GET only; no mutations. Rate limits and permission failures can affect results.
- Session is memory-only, clears on sign-out, page reload/navigation or after one hour. No token/data in localStorage, sessionStorage, IndexedDB, URL or generated artifacts. Reconnect with another token for a different resource owner; only one token is active at a time. Public repositories can be visible even if not selected for private-repository access.

## Security
The PAT is a powerful bearer credential. Generate a short-lived read-only token with minimal repository access. Mission itself is a public static shell, not a server-side website access gate; GitHub authorizes data access. The app cannot prove that the supplied token has no write privileges, so the user must choose read-only settings. A compromised frontend, browser extension or untrusted same-origin site could access browser memory or requests; protect main and consider a dedicated trusted origin for sensitive use. See SECURITY.md. Local logout does not revoke the PAT; revoke it in GitHub Settings if needed.

## Tests and publication
`npm test` with Node.js 22+ (no npm install needed). GitHub Actions tests changes; Pages automatically publishes via its existing branch source setting. Tests use mocked GitHub API responses, not real PATs.

## Migration
All Cloudflare Worker/OAuth and aaPanel deployment code removed. No external hosting required. If earlier resources were actually configured, remove only unused dedicated Mission credentials, OAuth/GitHub App installation and Worker, and disable any old Mission webhook. No actual account or hosting settings are changed by this repository.

References: https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user and https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens .
