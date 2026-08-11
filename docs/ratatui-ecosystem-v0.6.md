# Syndrid TUI Studio v0.6 — Ratatui ecosystem runtime

This release expands the v3 TachyonFX authoring work into a version-coherent Ratatui ecosystem layer. The `.tui` project remains the canonical portable design format; upstream crates are runtime/export adapters rather than a second source of truth.

## Pinned runtime

| Capability | Crate | Version | Integration |
|---|---|---:|---|
| Core TUI | `ratatui` | 0.30.2 | Core |
| Effects | `tachyonfx` | 0.25.1 | Effect AST/editor/runtime/export/MCP |
| Stateful multiline editing | `ratatui-textarea` | 0.9.2 | Adapter, state factory, Studio editing preview |
| Widget pack | `tui-widgets` | 0.7.10 | Big text/cards/popup/prompts/scrollbar/scrollview adapters |
| Terminal images | `ratatui-image` | 11.0.6 | Asset model, protocol/fit/fallback controls, local/URL preview, export plan |
| Embedded displays | `mousefood` | 0.5.2 | Optional embedded output feature; never desktop mouse input |
| ANSI import | `ansi-to-tui` | 8.0.1 | ANSI conversion adapter/runtime factory |
| Tree | `tui-tree-widget` | 0.24.1 | Stateful tree adapter/runtime state |
| Rich widget list | `tui-widget-list` | 0.15.3 | Stateful list adapter/runtime state |
| Terminal widget | `tui-term` | 0.3.4 | VT100 screen adapter with native PTY runner |
| Interaction | `ratatui-interact` | 0.5.3 | Focus/pointer adapter and compile-checked runtime |
| Syntax | `tui-syntax-highlight` | 0.2.0 | Cached syntax-highlight adapter/runtime |
| Capability profiling | `termprofile` | 0.2.4 | Terminal color/profile support for syntax/export |
| Node graph | `tui-nodes` | 0.10.0 | Node-graph adapter and first-class Studio component |

`tui-scrollview` is consumed through the `tui-widgets` workspace package.

## First-class Studio components

v0.6 adds portable component types for `Image`, `Code`, `AnsiText`, `Terminal`, and `NodeGraph`. Their production adapters are inferred automatically even before the Prototype inspector is opened. Existing generic components can opt into any compatible adapter through **Prototype → Ratatui ecosystem**.

Adapter configuration lives at `ComponentPrototypeSpec.ecosystem`, so it round-trips in `.tui` v3 and travels through the implementation spec/MCP surface.

## Native previews

### Images

HTTP/data/blob images render directly in the Studio preview. The Tauri desktop runtime can read supported local image files and return a bounded data URI for design-time preview. Production output uses `ratatui-image` protocol policy (`auto`, Kitty, Sixel, iTerm2, halfblocks), fit/alignment and authored fallback behavior.

### Terminal / PTY

The desktop app owns a bounded `portable-pty` session manager. A Terminal adapter can start/stop a real command, poll output, resize, and optionally send input. Production Ratatui rendering feeds terminal bytes into `tui-term`/VT100 state. PTY process and parser state are kept outside frame rendering.

## Runtime crate

`rust/syndrid-ratatui-runtime` pins the ecosystem to one compatible Ratatui version and exposes small adapter factories. CI builds/tests the default runtime and every advanced/embedded feature together. This catches incompatible upstream dependency changes before exporters emit invalid projects.

Mousefood is feature-gated as `embedded`; all advanced desktop ecosystem crates are feature-gated as `advanced`.

## Studio MCP

The existing Studio MCP remains the single agent bridge. In addition to TachyonFX v3 tools, it exposes operations for listing Ratatui libraries/adapters, reading/setting/clearing component adapter metadata, image assets, and exporting the project ecosystem/Cargo plan.

## Performance rules

- PTY processes, textarea state, image protocol state, tree/list state and scrolling state live outside frame rendering.
- ANSI parsing and syntax highlighting are cacheable conversions and must not be repeated every frame for unchanged source.
- Image previews and PTY output are bounded.
- `.tui` remains framework-neutral enough to migrate adapters without rewriting the component tree.
- Embedded mousefood support remains isolated from the desktop interaction path.

## Verification

CI gates:

1. ESLint
2. Vitest
3. TypeScript/Vite production build
4. generated export fixtures
5. default Rust ecosystem `cargo check` + `cargo test`
6. all-feature Rust ecosystem `cargo check` + `cargo test`
7. Windows Tauri + PTY + ecosystem runtime linkage
8. generated Ratatui Rust compilation
9. Go, Python and Node exporter verification

Do not ship a v0.6 installer unless the complete matrix is green.
