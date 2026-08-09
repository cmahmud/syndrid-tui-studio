# Syndrid TUI Studio MCP server

Syndrid TUI Studio exposes the live visual design to Codex and any other MCP-capable client. The MCP server is deliberately local: a stdio MCP process bridges to the browser editor over `ws://127.0.0.1:5175`.

```text
Codex / MCP client --stdio--> mcp-server/index.mjs --ws(127.0.0.1:5175)--> Syndrid TUI Studio
```

The structured project spec is the preferred implementation handoff. Generated Ratatui/TachyonFX code is optional scaffolding and must not force changes to Syndrid's existing architecture.

## Codex setup

1. Run `npm ci` and `npm run dev`.
2. Open the Studio and enable **Settings → Codex / MCP Agent Bridge**.
3. Start Codex from the repository root. The included `.codex/config.toml` declares the `syndrid_tui_studio` MCP server and runs `node mcp-server/index.mjs` from this directory.
4. Call `get_bridge_status`, then `get_project_spec` before making design changes.
5. After edits, call `get_layout_warnings` and `render_responsive_matrix` before treating the design as complete.

See `docs/CODEX.md` and `AGENTS.md` for the full agent workflow.

## Syndrid-specific tools

| Tool | Purpose |
| --- | --- |
| `get_project_spec` | Return the portable responsive/design-system/prototype/motion implementation spec. |
| `get_viewports` | Read committed responsive terminal sizes. |
| `set_viewport` | Switch the live editor to a committed viewport. |
| `upsert_viewport` | Add or edit a committed terminal breakpoint. |
| `render_responsive_matrix` | Render every committed viewport so an agent can compare layouts. |
| `get_design_tokens` | Read Syndrid semantic design tokens. |
| `update_design_tokens` | Update semantic colors, spacing, borders, or motion tokens. |
| `export_motion_plan` | Produce conservative TachyonFX-oriented Rust expressions from authored motion. |
| `update_responsive_override` | Set per-component behavior for a specific terminal breakpoint. |
| `update_prototype` | Set focus, states, key bindings, and motion metadata. |
| `set_preview_state` | Change the active interaction-state preview. |
| `replay_animations` | Replay design-time motion in the browser. |
| `save_reusable_component` | Save a component subtree into the project design system. |
| `insert_reusable_component` | Insert a fresh-ID instance of a saved reusable component. |
| `list_reusable_components` | List saved design-system components. |

## Core editing and verification tools

The original tree operations remain available: `get_tree`, `render_preview`, `get_layout_warnings`, `list_component_types`, `get_component_schema`, `list_templates`, `apply_template`, `add_component`, `update_props`, `update_layout`, `move_component`, `remove_component`, `duplicate_component`, `group_components`, and `ungroup_components`.

Mutating core operations that support `dryRun: true` can return a unified diff before committing. Agent changes use the same browser undo/redo history as human edits, and the editor surfaces agent activity as it lands.

## Connection model

- One browser tab is bridged at a time; a new connected tab becomes the active design target.
- `get_bridge_status` works even when no browser is attached and reports transport errors such as a busy bridge port.
- There is no remote/cloud listener: the WebSocket bridge binds to localhost.
- There is no live push feed to the agent. Re-read the tree/project spec after human edits.
- Concurrent human/agent changes are last-write-wins, so prefer short coherent agent mutations and verify after each logical change.
