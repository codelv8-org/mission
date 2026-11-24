# Mission — Neo-Brutalism + Bento

## Reference and implementation
UI UX Pro Max upstream [SKILL.md](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/a4fc248f6136552cb881e298847abc7ddce84e6b/.claude/skills/ui-ux-pro-max/SKILL.md), [styles.csv](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/a4fc248f6136552cb881e298847abc7ddce84e6b/.claude/skills/ui-ux-pro-max/data/styles.csv): active desktop style ID `neubrutalism` (row 38), supplemental `neo-brutalism-mobile` and active `bento-box-grid`. Applied source guidance directly. The Python generator is not installed; fetching the repository into the local execution runtime failed because github.com DNS resolution was unavailable. Quick-reference accessibility, touch and performance guidance reviewed. Old clay direction superseded.

## Material and design tokens
- Canvas #FFFDF5; white surfaces; ink #111111; muted #292929.
- Primary action/active navigation #FFDB58; accent blocks #4ECDC4, #76BFFF, #FF6B6B, #C4B5FD. Tinted data surfaces.
- Primary outlines 3px; controls 2px; dense table cells and badges 1px. 4px radius; hard 5px 5px 0 #111111 card shadow and 3px offset for controls. No gradients, blur or inset shadow.
- Bold system sans headlines, tabular numbers, mono PAT field, dark type on saturated colors. Thai fallback; no font CDN. Mechanical press feedback 120ms; reduced motion disables translation. No rotated analytics cards or idle animation.
- Semantic focus ring, explicit state labels and counts, native controls, no reliance on color alone. White text on deep-blue high intensity heatmap. Keyboard selection and local table overflow.

## Layout
Preserve Login, Overview, Dashboard, Timeline, Priority, Repositories, native repository dialog. Login uses yellow block hero and local SVG poster. Workspace uses cream background, white sidebar, yellow selected navigation and refresh. Dashboard retains responsive 12-column grid (3 KPI, 7+5 timeline/activity, four lower cards at 1440+, stack on mobile). Data filters, selected-day detail, priority distribution and workflow statuses remain. No fabricated figures. Adapt the style to developer analytics rather than sacrificing legibility.

## Checks
PAT, GitHub API client, analytics logic, runtime IDs and CSP unchanged. No backend, remote script, new runtime dependency or new API request. Static tests check representative contrast and no gradients; Chrome smoke checks computed material, responsive layout, drill-down, filters, modal, reduced motion and logout with a synthetic fixture. Screenshots produced by CI. Actual PAT login and visual inspection of screenshots remain separate.
