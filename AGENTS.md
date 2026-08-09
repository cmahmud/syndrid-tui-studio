# Syndrid TUI Studio — Codex instructions

## Purpose
This repository is a Ratatui-first visual TUI design environment for Syndrid CLI. The visual design and portable `syndrid-tui-spec/v1` artifact are authoritative design intent; generated Rust is optional scaffolding and must never force a framework migration.

## Non-negotiables
- Syndrid remains Rust + Ratatui. Do not replace its architecture with a web UI or another TUI framework.
- Treat Wide (160×48), Medium (120×36), Narrow (80×24), and Short (100×18) as required responsive verification targets unless the project file explicitly changes them.
- Preserve explicit keyboard focus and key-binding semantics. Widget actions must not fire globally when another widget owns focus.
- Motion must stay tasteful and app-like. Prefer short 120–280ms transitions and TachyonFX-compatible effects. Never block input, streaming output, cancellation, or resize handling for animation.
- Respect reduced-motion behavior for every decorative transition.
- Terminal columns are display cells, not JavaScript string length. Preserve wide Unicode/emoji alignment.
- Prefer reusable Syndrid components and semantic design tokens over one-off styling.

## Codex + Studio workflow
1. Install dependencies: `npm ci`.
2. Start the editor: `npm run dev`.
3. In Studio Settings, enable **Codex / MCP Agent Bridge**.
4. Start Codex from this repository. The project `.codex/config.toml` launches the local MCP server automatically when project config is trusted.
5. Before editing a design, call `get_bridge_status`, then `get_project_spec`.
6. After mutations, call `get_layout_warnings` and `render_responsive_matrix`.
7. Use `update_prototype` for focus/state/motion intent and `update_responsive_override` for breakpoint-specific design changes.
8. Use `save_reusable_component` / `insert_reusable_component` instead of cloning one-off variants when a pattern belongs in the design system.
9. For motion implementation, prefer the Agent Spec's TachyonFX plan and preserve the authored reduced-motion fallback.

## Verification
Run these after code changes when dependencies are available:
- `npm test`
- `npm run build`
- `npm run lint`
- `npm run verify:syndrid`

Do not claim a clean build if dependency installation or Rust tooling is unavailable; state exactly what was and was not executed.
