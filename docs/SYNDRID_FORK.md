# Syndrid TUI Studio fork notes

This fork turns the upstream visual TUI editor into a Ratatui-first design environment for Syndrid CLI. The design artifact is the source of visual/interaction intent; generated code is optional scaffolding.

## What is new

### Responsive terminal design

- Committed **Wide 160×48**, **Medium 120×36**, **Narrow 80×24**, and **Short 100×18** viewports.
- Custom terminal viewports can be added to the project.
- Components can carry per-viewport visibility, size, style, and layout overrides.
- The Responsive Matrix renders every committed viewport together for comparison and shows per-breakpoint layout-warning counts.
- Export rendering now treats the requested terminal dimensions as authoritative, so root screens fill the target canvas.

### Terminal cell correctness

- Text measurement uses terminal display cells instead of JavaScript UTF-16 length.
- CJK/wide glyphs, emoji, and combining sequences are measured as graphemes.
- Slicing and padding do not split double-width graphemes.
- The character canvas tracks continuation cells and clears the owner when the second half of a wide glyph is overwritten.

This materially improves terminal fidelity, but the browser canvas remains a design-time renderer. Ratatui export plus compile CI remains the native implementation verification path.

### Interaction prototyping

Components can store:

- deterministic focusability and focus order;
- named states such as focused, selected, disabled, loading, success, warning, and error;
- state-specific visual/layout/prop overrides;
- key bindings;
- motion triggers tied to state transitions.

Ratatui scaffolding now uses Tab/BackTab focus dispatch instead of firing every widget key handler globally. User-entered handler names are sanitized into valid Rust identifiers.

### Motion

The visual editor supports authored motion with:

- trigger;
- effect;
- direction;
- duration;
- delay;
- easing;
- looping;
- reduced-motion fallback;
- an implementation/TachyonFX hint.

The browser plays a design-time approximation. The **Motion** export and Agent Spec emit a conservative TachyonFX-oriented Rust plan intended to be integrated into Syndrid's existing render/event loop without sleeps or input blocking.

### Syndrid design system

Project files now persist:

- semantic colors;
- spacing tokens;
- border hierarchy;
- motion timing tokens;
- reusable component subtrees.

Reusable insertions get fresh component IDs and retain a reference to their source definition.

### Codex / MCP

The repository includes:

- `.codex/config.toml` — project-local MCP server declaration;
- `AGENTS.md` — Ratatui/Syndrid implementation constraints for Codex;
- `docs/CODEX.md` — setup and recommended agent loop;
- expanded MCP tools for responsive design, project specs, states, motion, design tokens, reusable components, and breakpoint diagnostics;
- **Agent Spec** export (`syndrid-tui-spec/v1`) containing source tree, project metadata, responsive previews, interaction intent, motion plan, and implementation rules.

The project-local Codex config uses `writes` approval mode together with MCP read-only/closed-world annotations: inspection tools stay low-friction while mutations remain approval-aware.

A recommended Codex turn is:

1. `get_bridge_status`
2. `get_project_spec`
3. make one coherent change
4. `get_layout_warnings`
5. `render_responsive_matrix`
6. inspect relevant prototype states
7. replay motion if changed
8. implement from the structured spec in Syndrid

## Project file compatibility

`.tui` files are now version 2. Version 1 files still open and receive safe default Syndrid project metadata. Opening a v1 file resets v2-only project state so metadata from a previously open project cannot leak into the older design.

Project loading normalizes malformed or partial metadata: invalid terminal sizes, bad token values, malformed responsive/prototype metadata, invalid animation payloads, and malformed reusable component trees are rejected or replaced with safe defaults rather than being trusted blindly. MCP token and viewport writes are routed through the same normalization boundary.

## Validation

Normal verification on a development machine with dependencies available:

```bash
npm ci
npm test
npm run build
npm run lint
npm run verify:syndrid
```

The CI workflow also compiles generated Ratatui fixtures using the real Rust toolchain.

## Design principles for Syndrid

- App-like, not over-animated.
- Motion should communicate state/continuity, not hide latency.
- Streaming, cancellation, keyboard input, and resize remain responsive while effects run.
- Every decorative transition must have reduced-motion behavior.
- Responsive design is intentional adaptation, not merely shrinking the wide screen.
- Status is semantically truthful; polish never fabricates progress or health.
- Reuse components/tokens before adding one-off styling.
