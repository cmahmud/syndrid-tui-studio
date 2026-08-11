# Codex integration

Syndrid TUI Studio exposes the live browser design through a local MCP stdio server. Codex can inspect the tree and project spec, edit components, author responsive overrides and prototype motion, and render all responsive breakpoints for verification.

## Start

```bash
npm ci
npm run dev
```

Open Studio and enable **Settings → Codex / MCP Agent Bridge**. Then start Codex from the repository root. `.codex/config.toml` configures the `syndrid_tui_studio` stdio server (`node --import ./mcp-server/bridge-auth-preload.mjs ./mcp-server/index.mjs`).

The MCP server marks inspection tools as read-only and all tools as closed-world/local. The project config uses Codex `writes` approval mode, so read-only inspection can stay low-friction while operations that change the design remain approval-aware. The toolbar's **Codex** status pill opens the bridge settings and shows whether the browser connection is live.

## Recommended agent loop

1. `get_bridge_status`
2. `get_project_spec`
3. Make one coherent design change.
4. `get_layout_warnings`
5. `render_responsive_matrix`
6. Correct overflow/focus issues.
7. `set_preview_state` and `replay_animations` when interaction/motion was changed.
8. Use the exported **Motion** plan or `get_project_spec.motion` when implementing TachyonFX in Syndrid.

`get_project_spec` is designed to be portable into the real Syndrid repository. It explicitly tells an implementation agent to preserve existing Syndrid architecture, use Ratatui constraints, implement authored interaction/focus semantics, and map motion to TachyonFX where practical.

## Available Syndrid-specific MCP tools

- `get_project_spec`
- `get_viewports`
- `set_viewport`
- `upsert_viewport`
- `render_responsive_matrix`
- `get_design_tokens`
- `update_design_tokens`
- `export_motion_plan`
- `update_responsive_override`
- `update_prototype`
- `set_preview_state`
- `replay_animations`
- `save_reusable_component`
- `insert_reusable_component`
- `list_reusable_components`

The original component-tree editing tools remain available as well.


## Motion integration

The Studio's browser animation is a design-time approximation. The portable Agent Spec contains the authored trigger, duration, easing, reduced-motion fallback, and a conservative TachyonFX 0.25.x Rust motion plan. In Syndrid, apply effects to the component `Rect` without sleeping/blocking the input or streaming loop.
