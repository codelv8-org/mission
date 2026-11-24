# MISSION — Developer Mission Control

A private-data workspace with a public GitHub Pages application shell.

## MVP
- Google Identity Services sign-in with a server-verified ID token and explicit account allowlist.
- Read-only monitoring of up to 8 explicitly configured GitHub repositories.
- Overview, recent activity (7/30 days), repository status and issue priorities derived from GitHub labels (P0–P3 / priority:high / critical / blocked).
- Partial upstream failures are displayed; no demo data or invented progress.
- No credentials or private snapshots in the static site. No token persistence in browser storage.

## Deployment (required before sign-in works)

1. Google Auth Platform: configure Branding and Audience. Create a Web application OAuth client at https://console.cloud.google.com/auth/clients. Add the authorized JavaScript origin `https://codelv8-org.github.io` (origin only, not /mission). For a dedicated custom domain add its exact HTTPS origin instead. If in Testing mode, add the intended Google test users. Only the client ID is needed, not a client secret.
2. Create a fine-grained GitHub PAT for selected repositories only, read-only permissions: Metadata, Contents, Issues, Pull requests, Actions. Organization approval may be required. For repositories across multiple owners, use a GitHub App / separate credentials in a later release; one token cannot necessarily access every owner.
3. Deploy the Worker:

       cd worker
       npm install
       npm test
       npx wrangler login
       npx wrangler deploy

   In the Worker dashboard or using `npx wrangler secret put NAME`, set:
   - GOOGLE_CLIENT_ID: the exact OAuth web client ID.
   - GOOGLE_ALLOWED_EMAILS: comma-separated exact verified Gmail or Google Workspace email addresses. Empty = deny. Do not use a whole-domain wildcard.
   - GOOGLE_ALLOWED_SUBS: optional comma-separated Google subject identifiers (stable IDs). Either explicit allowlist can grant access.
   - GITHUB_TOKEN: fine-grained read-only token.
   - GITHUB_REPOSITORIES: comma-separated owner/repo values, up to 8.

   The public ALLOWED_ORIGIN in worker/wrangler.toml must match the frontend origin exactly. Set it before deploying if using a custom domain. Prefer a dedicated origin for production rather than sharing github.io origin with other projects.
4. Edit docs/config.js with the Google client ID and deployed HTTPS Worker origin (no path or trailing slash required). These values are public, not secrets.
5. GitHub repo Settings → Pages → Deploy from a branch → main → /docs → Save. Expected site: https://codelv8-org.github.io/mission/ . This requires repository admin action; committing files alone does not enable Pages.
6. Verify authorized account login succeeds, unauthorized account receives 403, unauthenticated API receives 401, unconfigured backend fails closed, and GitHub partial errors are visible. See SECURITY.md.

## Scope and limits
This is a read-only MVP. Issue priorities are derived from labels, not edited in GitHub. Commits are from the default branch, pull requests from the latest updated page, workflow runs from the latest page. The timeline is a bounded recent sample, not a complete audit history. The priority queue is separately loaded from the latest 100 open issue/PR results per repository (PRs excluded) regardless of age; it is not a complete backlog for larger repositories. It does not infer an active AI agent merely from a commit. No background synchronization, database, or AI summaries yet. Refreshes consume GitHub API quota.

The GitHub Pages HTML/CSS/JS are public, even before login. Only the API/data is protected. If all frontend assets themselves must be private, deploy the frontend on a host with server/edge authentication (e.g. Cloudflare Access with a protected origin, no public bypass); do not publish them on public Pages.

## References
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.cloudflare.com/workers/configuration/secrets/
