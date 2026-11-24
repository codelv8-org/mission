# Mission — Liquid Glass Design System

Reference: [bilalgursen/liquid-glass](https://github.com/bilalgursen/liquid-glass/tree/59882f2436d9a2ea35cd6c62560c4003accfcdff), [GlassCard](https://github.com/bilalgursen/liquid-glass/blob/59882f2436d9a2ea35cd6c62560c4003accfcdff/src/components/liquid-glass/glass-card.tsx), [GlassButton](https://github.com/bilalgursen/liquid-glass/blob/59882f2436d9a2ea35cd6c62560c4003accfcdff/src/components/liquid-glass/glass-button.tsx) and [widget example](https://github.com/bilalgursen/liquid-glass/blob/59882f2436d9a2ea35cd6c62560c4003accfcdff/src/docs/demos/glass-card-widgets.tsx).

## Architecture decision
The upstream library uses React 19, Tailwind v4, WebGL2, DOM snapshotting and selected UI SDK components; its skill requires copying its components verbatim when installing that library. Mission remains a static vanilla-JS site serving main /docs on GitHub Pages. This revision is a native CSS/SVG **visual adaptation**, not an installation, port or reproduction of the upstream WebGL2 engine. No source files, third-party dependencies, remote scripts or build pipeline are added. Native backdrop-filter provides frost; a separate local SVG uses a radial displacement map to refract only the decorative login wallpaper. Live DOM refraction and gooey WebGL morphs are not implemented. The reference card's source defaults are 28px corners, 5px frost, 70% tint and two soft shadow layers; Mission uses slightly more white tint (76%) for readable data.

## Material and typography
Static colored wallpaper with blue, indigo, mint and rose accents. Clear glass panels use thin white rims, translucent tint, subtle highlights and two soft outer shadows, opaque fallback when backdrop-filter is unavailable. Tinted primary pills remain readable. Floating sidebar uses a single sliding CSS lens aligned to active native buttons via :has, with visible selected-state fallback. Small status badges are legible solid tints, not a live shader. Keep dashboard surfaces still and avoid blur on every row. Use the tokens in docs/style.css. Light theme only; system fonts with Thai fallback.

## Components
Login: deep blue hero, local optical lens SVG, frosted PAT card. Workspace: floating sidebar, pill actions, frosted KPI bento cards, timeline, priority queue, repository tiles. Native accessible dialog with dense translucent surface and clearly bordered input/checkbox states. Preserve readable labels, explicit P0–P3, focus rings, reduced motion, reduced transparency and forced colors. Mobile layouts retain the existing responsive breakpoints.

## Security and checks
Existing PAT logic, API client, all runtime IDs and exact CSP stay unchanged. Local assets only. No stored credentials or fabricated live data. Representative color-pair contrast and static contract tests run in Mission CI. Real browser visual QA (especially SVG refraction and backdrop-filter across browsers), live PAT login and deployment should be verified separately.

## Analytics dashboard
Separate Dashboard navigation entry, retaining Overview. 12-column responsive bento; project timeline spans the width, daily rhythm and priority/focus cards share rows, workflow signals span width. Use compact local SVG charts with accessible daily table, semantic heat intensity plus counts, scrollable native timeline table, day drill-down, explicit missing data marks and no fake completion scores. All analytics derive from current in-memory sample with UTC boundaries, no additional permissions or API requests. Native controls, no inline styles or new scripts from remote origins.
