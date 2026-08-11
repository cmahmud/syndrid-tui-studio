# Syndrid TUI Studio v3 — TachyonFX authoring

Syndrid v3 treats motion as portable design intent rather than as browser CSS or an opaque Rust snippet.

## Canonical model

Every authored effect is stored as a strongly typed `EffectDefinition` in the `.tui` project tree. The canonical graph supports:

- primitive TachyonFX effects
- sequence composition
- parallel composition
- delays
- repeat / forever / ping-pong behavior
- duration and interpolation
- directional motion
- spatial patterns
- component / region / rectangle / filtered-cell targets
- mount, focus, selection, state, key, event and manual triggers
- a first-class reduced-motion variant

The visual editor, DSL projection, design-time playback, Rust exporter and MCP surface all operate on that graph.

## `.tui` v3

Saved projects now use `version: "3"` and add:

- `prototype.effects` on components
- `project.effectPlayback`
- `project.imageAssets`
- `project.runtimeLibraries`

The loader accepts v1, v2 and v3 projects. Legacy `AnimationSpec` records are migrated into structured effects and retained as a compatibility mirror while the older Canvas/export paths are phased out.

## Studio effect editor

The component Prototype panel now contains TachyonFX Studio with:

- searchable/category-filtered effect catalog
- deterministic elapsed-time preview
- play/pause/replay
- scrubber and speed control
- loop preview
- normal/reduced-motion preview switch
- graph tree
- sequence/parallel composition
- primitive, duration, interpolation, motion and spatial controls
- DSL editing, validation and bounded import
- target and trigger controls
- reduced-motion mode

Design-time playback advances from wall-clock delta time and does not parse DSL per frame.

## DSL policy

The structured graph is canonical. DSL is a projection.

Syndrid can import the bounded visual subset. A valid expression outside that subset is kept as a `custom` primitive containing the source DSL rather than being silently discarded. Full native validation still belongs to the consuming Rust/TachyonFX build.

## Rust export

`exportTachyonFxMotionPlan` generates a production-oriented Rust motion module with:

- one constructor per authored effect
- normal/reduced-motion variants
- target-area scaffolding
- basic cell-filter scaffolding
- trigger hookup guidance
- elapsed-time EffectManager guidance

`exportTachyonFxCargoSnippet` exposes the intended Ratatui ecosystem dependencies.

The normal single-file Ratatui exporter remains backwards-compatible and CI-verified; the TachyonFX plan is an additional production integration artifact so existing exports are not destabilized.

## Ratatui ecosystem integration

The portable project spec records the runtime-library intent for:

- `tachyonfx`
- `ratatui-textarea`
- `tui-widgets`
- `ratatui-image`

It also records optional integration candidates:

- `tui-scrollview`
- `tui-tree-widget`
- `tui-widget-list`
- `tui-term`
- `ratatui-interact`
- `tui-syntax-highlight`
- `tui-nodes`
- `termprofile`
- `ansi-to-tui`

`mousefood` is intentionally treated as an optional embedded-display backend, not as the desktop pointer-input layer.

`ratatui-image` project metadata is represented by portable image assets with fit, alignment, protocol (`auto`, Kitty, Sixel, iTerm2, halfblocks) and fallback policy. A dedicated visual Image component / native terminal protocol preview remains a separate integration step from the v3 motion core.

## MCP v3

The existing `syndrid_tui_studio` MCP server was extended rather than replaced. It can now:

- discover the effect catalog
- inspect/create/update/delete/duplicate effects
- replace composition graphs
- get/set/validate DSL
- set targets, triggers and reduced-motion variants
- control and inspect playback
- evaluate an effect frame at an exact elapsed time
- export TachyonFX Rust
- list/create/update/remove portable image assets
- render the existing responsive matrix

Existing component, design-token, responsive, template, preview and reusable-component tools remain available.

## Performance constraints

- playback is delta-time driven
- DSL is not reparsed per frame
- effect graphs are only cloned on deliberate edits/duplication
- MCP responses remain structured and bounded to requested data
- the compatibility animation mirror avoids replacing the existing Canvas architecture in the same migration

## Validation

CI gates this branch through:

1. ESLint
2. Vitest
3. TypeScript/Vite production build
4. export fixture generation
5. Rust/Ratatui export compilation
6. Go export checks
7. Node export checks
8. Python export checks

Dedicated v3 tests cover sequence/parallel timing, reduced motion, DSL projection/validation, project migration, image metadata and playback normalization.

## Follow-up integration surface

The v3 schema deliberately leaves room for deeper native integrations without another project-format break:

- apply full composed v3 effect frames directly to the main design Canvas instead of the legacy representative-animation mirror
- first-class Image component using `ratatui-image`
- stateful generated `ratatui-textarea` widgets
- `tui-term` PTY execution preview
- terminal capability probing with `termprofile`
- visual node-graph representation with `tui-nodes`
- syntax highlighting for DSL/generated Rust
- optional embedded-display export through `mousefood`

These are additive integrations; the effect AST, `.tui` v3 format and MCP contracts are designed so they do not require another canonical-model rewrite.
