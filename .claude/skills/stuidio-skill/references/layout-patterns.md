# The 7 canonical TUI layout archetypes

Sourced from `docs/design_anal.md`'s competitive analysis (Hyperbliss's
"Terminal Renaissance" + the awesometui.com 2026 Award winners). Each one
already has a matching starter template in `src/constants/templates.ts` —
the human "New from Template" gallery in the app builds the exact same
trees these describe, so you can open one there to see a concrete example
before building your own from scratch.

| Pattern | What it is | Template id |
| --- | --- | --- |
| Persistent Multi-Panel | Sidebar list + main detail view + a persistent footer status bar. lazygit's signature layout — "everything visible, nothing modal." | `persistent-multi-panel` |
| Miller Columns | Three side-by-side columns, each previewing the next level of a hierarchy (file managers like ranger/nnn). | `miller-columns` |
| Drill-Down Stack | A single full-width list with a breadcrumb showing the current path/level, replacing its content as you go deeper instead of stacking panels. | `drill-down-stack` |
| Widget Dashboard | A grid of independent, self-contained monitoring widgets (gauges, sparklines, tables) with no shared navigation state — btop's layout. | `widget-dashboard` |
| IDE Three-Panel | File explorer + main editor/content + an outline/detail panel, plus a persistent status bar — the VS Code shape. | `ide-three-panel` |
| Overlay/Popup | A background view with a centered modal dialog on top for a blocking confirmation or input. | `overlay-popup` |
| Header + Scrollable List | A title/header bar, a scrollable list or table body, and a summary status bar — inbox/log-viewer shape. | `header-scrollable-list` |

Pick the pattern that matches what the user describes before inventing a
new arrangement — these seven cover the large majority of real TUIs.
