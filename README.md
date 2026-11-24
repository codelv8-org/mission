# MISSION — Developer Mission Control

Google-authenticated GitHub portfolio and activity workspace. Deployment target: **aaPanel (Ubuntu/Debian), Node.js 22+, Nginx reverse proxy, systemd, GitHub Actions**. Cloudflare Worker and GitHub Pages are no longer required.

## MVP
Overview, recent Activity Timeline (7/30 days), Priority Queue from P0–P3/blocked labels, repository portfolio and GitHub read-only monitoring of up to eight configured repositories. Google ID tokens are verified on the server using jose with an explicit verified account allowlist. Public frontend shell contains no private GitHub data or credentials. No database, background sync, or write access.

## One-time deployment

Example domain: `mission.codelv8.com`; replace with your actual domain.

1. In Google Cloud Console, add `https://mission.codelv8.com` to Authorized JavaScript origins of the existing web OAuth client. No client secret or redirect URI is required for this popup ID-token flow. Keep test users configured if needed.
2. Prepare a fine-grained read-only GitHub PAT for selected repositories (Metadata, Contents, Issues, Pull requests, Actions). Do not paste it into chat, commit it, or add it to the deployment workflow.
3. Follow [aaPanel deployment guide](deploy/README.md). Set the Google client ID, authorized email(s), PAT and repository list once in `/etc/mission/mission.env` on the host. The browser receives only its public config dynamically.
4. Create an HTTPS aaPanel reverse proxy to `http://127.0.0.1:3107`. Enable TLS; ensure the port is available. Disable proxy caching for this site and set a read timeout of at least 120s. Do not point a public web root to the source directory.
5. Configure the restricted deployment SSH key and host verification in GitHub Actions, then run the workflow manually once. Subsequent pushes to main auto-test and deploy.

Disable the old Pages publication in Settings → Pages; the old public shell does not contain production data. Do not serve the same configuration on an unrelated origin.

## Local development
`npm install`, `npm test`. The server requires valid environment configuration before starting; production service binds to localhost only.

## Scope
The timeline is a bounded recent sample from the default branch commits, latest updated PRs/issues, and workflow runs. The priority queue is a separate sample of the latest 100 open issue/PR results per repository with PRs excluded, irrespective of age. This is not a full audit or complete backlog. One PAT may not cover several resource owners; future GitHub App support can address that. Private data is protected by the API; login shell and client-side assets are public by design. The eight-repository bound remains for latency and GitHub quotas, not a Cloudflare limit.

See [SECURITY.md](SECURITY.md).
