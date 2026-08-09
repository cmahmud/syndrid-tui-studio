---
name: stuidio-skill
description: >
  Use this skill when an MCP client is connected to sTUIdio's agent bridge
  (mcp-server/, AI-integration Phase 1) and asked to design, edit, or extend
  a TUI layout through its 16 tools: get_bridge_status, get_tree,
  render_preview, get_layout_warnings, list_component_types,
  get_component_schema, list_templates, apply_template, add_component,
  update_props, update_layout, move_component, remove_component,
  duplicate_component, group_components, ungroup_components (the mutating
  ones support a dryRun flag for a diff preview without committing). Covers
  the component vocabulary, the turn-based tool workflow, and the hard
  structural constraints a structurally-valid tree can still violate (which
  containers really nest children vs. configure via props, absolute vs.
  flexbox/grid layout) so a model builds an idiomatic design, not just one
  that passes validation. Companion to the tui-studio skill, which covers
  editing sTUIdio's own codebase instead of using it.
---

# Using sTUIdio as an agent

You're driving a live sTUIdio browser tab through its MCP tool surface, not
reading or writing its source code. `isValidComponentTree` (server-side)
catches malformed shapes, but plenty of *structurally valid* trees still
look wrong or won't export cleanly — the guidance below closes that gap.

## Before you touch anything

- If any tool call fails unexpectedly, call `get_bridge_status` before
  anything else — it works even with no browser connected, and reports
  *why* (a port conflict, a disconnected tab, a timeout) instead of you
  guessing from a bare "no browser tab connected" error.
- Tool calls are pull/turn-based, not a live feed — call `get_tree` at the
  start of every turn. A human may have edited the design since your last
  turn; never assume your last-seen tree is still current.
- Call `list_component_types` once to see the full vocabulary, and
  `get_component_schema` for any type before using it the first time — its
  `defaultProps`/`defaultLayout`/`defaultStyle` are exactly what
  `add_component` merges your overrides on top of, so you only need to
  specify what you're actually changing.
- Every mutating call resolves ids against the live tree first. A stale or
  made-up id gets you a clear error, not a silent no-op — read errors and
  retry rather than assuming a call succeeded.
- Call `render_preview` after a batch of changes to see the actual rendered
  result (text or ANSI) instead of only reasoning from raw tree JSON. Call
  `get_layout_warnings` too — it's the structured, no-eyeballing-required
  version of "did I just cause an overflow or a negative-space layout,"
  backed by the exact same detection as the human UI's own warning banner.
- Every change rides sTUIdio's real undo/redo history. A human collaborator
  can undo your edit with Cmd/Ctrl+Z exactly like their own — you don't need
  to build your own safety net.

## Component vocabulary

| Type | Category | Purpose |
| --- | --- | --- |
| Screen | layout | Root container (always `id: 'root'`) |
| Box | layout | Generic container, optional border |
| Grid | layout | CSS-grid-style layout |
| Spacer | layout | Empty space |
| Separator | layout | Horizontal/vertical divider line |
| Modal | layout | Overlay dialog |
| TextInput | input | Single-line text input |
| TextArea | input | Multiline editable text input |
| Button | input | Clickable button |
| Checkbox | input | Checkbox input |
| Radio | input | Radio button input |
| Select | input | Dropdown select |
| Toggle | input | Toggle switch |
| Text | display | Static text label |
| Spinner | display | Loading spinner |
| ProgressBar | display | Progress indicator |
| Gauge | display | Labeled progress metric (CPU, memory) |
| Sparkline | display | Inline mini bar chart from a numeric series |
| Log | display | Scrolling log/output panel |
| Toast | display | Non-blocking status notification |
| Table | data | Data table (configure via `props.columns`/`props.rows`) |
| List | data | Selectable list (configure via `props.items`) |
| Tree | data | Hierarchical tree (configure via `props.items`, nested) |
| Menu | navigation | Navigation menu |
| Tabs | navigation | Tab navigation (children must be `Box`, one per tab) |
| StatusBar | navigation | Footer bar showing keybinding hints |
| Breadcrumb | navigation | Breadcrumb navigation |

## Hard constraints (structurally valid ≠ correct)

- **Real nesting containers**: only `Screen`, `Box`, `Grid` are genuine
  layout containers meant to hold arbitrary children — nest freely. `Modal`
  only accepts `Box`/`Grid`/`Text` as direct children. `Tabs` only accepts
  `Box` as direct children (one per tab).
- **Data-driven leaves, not containers**: `List`, `Tree`, `Table`, `Menu`,
  `Breadcrumb` express their real content through props
  (`items`/`columns`+`rows`, shape varies by type — check
  `get_component_schema`), not through nested `ComponentNode` children.
  Nothing renders or exports a child nested under one of these — configure
  its props instead.
- **Every other type is a true leaf** (`TextInput`, `TextArea`, `Button`,
  `Checkbox`, `Radio`, `Select`, `Toggle`, `Text`, `Spinner`, `ProgressBar`,
  `Gauge`, `Sparkline`, `Log`, `Toast`, `StatusBar`, `Spacer`, `Separator`):
  never give it children.
- **Layout is two different systems depending on depth**: the root
  (`id: 'root'`, `type: 'Screen'`, 80x24 columns/rows by default) always
  uses **absolute** layout — its direct children need an explicit numeric
  `layout.x`/`layout.y` and a numeric (or `'fill'`) `props.width`/`height`.
  Everything nested *inside* a `Box`/`Grid` flows via that container's own
  `flexbox` (`direction`/`gap`/`padding`) or `grid` (`columns`/`rows`)
  layout instead — those children need neither `x` nor `y`. Check
  `get_component_schema`'s `defaultLayout.type` for a container before
  nesting into it.

## Recommended turn loop

1. `get_tree` — see current state.
2. `list_component_types` / `get_component_schema` — discover before using
   an unfamiliar type.
3. One mutation at a time (`add_component`, `update_props`,
   `update_layout`, `move_component`, `remove_component`,
   `duplicate_component`, `group_components`, `ungroup_components`) — each
   returns a clear error on a bad id/type so you can self-correct within the
   turn instead of compounding a mistake. Before a risky one (removing a
   subtree, restyling broadly), pass `dryRun: true` — same tool, same
   arguments — to get a unified diff of the would-be result without
   committing anything, then decide whether to run it for real.
4. Starting a screen from scratch — call `list_templates` and `apply_template`
   (also supports `dryRun`) to start from one of the seven canonical layouts
   (`references/layout-patterns.md`) instead of building one node-by-node.
5. Adding keyboard navigation to a `List`/`Table`/`Tree` — use a real
   convention (`references/keybinding-conventions.md`) rather than
   inventing one.
6. After a batch of changes — `render_preview` and `get_layout_warnings`
   before moving on, to catch a visual or structural problem in the same
   turn you introduced it.

## On-demand references

- [`references/layout-patterns.md`](references/layout-patterns.md) — the 7
  canonical layout archetypes, each with a matching starter template already
  built in `src/constants/templates.ts`.
- [`references/keybinding-conventions.md`](references/keybinding-conventions.md)
  — the 3 near-universal nav conventions already offered as presets in the
  human PropertyPanel UI.
- [`../tui-studio/SKILL.md`](../tui-studio/SKILL.md#component--framework-idiom-map)
  — which native widgets each of the 7 export-target frameworks really has;
  useful if the user cares how the design will look once exported.
