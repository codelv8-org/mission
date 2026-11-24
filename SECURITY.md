# Security and release checklist

## Trust boundary
Browser code is untrusted. Every data request independently verifies a Google JWT signature against Google's JWKS using jose, with RS256, issuer, audience, expiration, issued-at, verified email and subject checks. Access is denied unless an explicit allowlist entry matches. Email-based access requires Google-authoritative Gmail or Workspace identity; subject IDs are preferred for durable identity. Bearer tokens remain in memory, are never sent to GitHub, and are cleared on sign-out/expiry. No session cookie is used. Sign-out is local, not Google account revocation.

Only the configured repository list is queried, with a server-side read-only token. No arbitrary proxy URL, mutation endpoints, or raw GitHub response passthrough. CORS is exact-origin and is supplementary, not authentication. Responses are no-store; do not log tokens, commit messages or private issue contents. Frontend renders all upstream text with DOM textContent.

## Release checks
- [ ] Google OAuth web client and audience configured.
- [ ] Exact production origin configured on both Google and Worker.
- [ ] Only intended email/subject allowlist configured (no wildcard).
- [ ] PAT limited to approved repository selection and read-only permissions.
- [ ] Worker secrets set out of Git; token absent from frontend, repository and logs.
- [ ] Actual Google sign-in: allowlisted account 200, other account 403.
- [ ] Missing, expired, malformed, wrong-audience and forged tokens denied.
- [ ] API response cannot be read from a disallowed origin.
- [ ] Refresh, sign-out, expiry and upstream failure tested.
- [ ] Dedicated origin and rate limiting reviewed for production.
- [ ] Public Pages inspected for absence of private data or tokens.

No real OAuth credentials, Cloudflare deployment, or production authentication test is included in the initial commit.
