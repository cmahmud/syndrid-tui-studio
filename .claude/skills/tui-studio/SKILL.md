---
name: tui-studio
description: >
  Codebase map for sTUIdio itself — a Figma-like visual editor for Terminal
  UIs that exports designs to Ink, BubbleTea, Blessed, Textual, OpenTUI, and
  Tview code. Use this skill when adding or modifying a ComponentType, editing
  an exporter under src/utils/export/exporters/, touching the .tui file format,
  the theme palettes, or the layout engine. It documents the ~10-point checklist
  a new component type must satisfy, which frameworks have real native widgets
  for which studio components (verified against real docs, not guessed), the
  .tui save-file schema, and the theme/color-mode system. Complements the
  generic tui-design skill, which covers TUI design principles in general —
  this one covers this specific codebase's architecture.
---

# sTUIdio (this codebase)

Reference for working inside `tui-studio` itself. See the repo's own
`CLAUDE.md` for commands and the top-level architecture overview; this skill
goes one level deeper on the two areas with the most hidden structure: adding
component types, and the per-framework export idioms.

## Adding a new `ComponentType`

Every new component type touches all of these (verified by building
Separator, Gauge, Sparkline, Log, and StatusBar in P4 — see `todo.md`):

1. [`src/types/components.ts`](../../../src/types/components.ts) — add to the `ComponentType` union.
2. [`src/constants/components.ts`](../../../src/constants/components.ts) — `COMPONENT_LIBRARY` entry (`defaultProps`/`defaultLayout`/`defaultStyle`/`defaultEvents`/`icon`/`category`).
3. [`src/utils/validation.ts`](../../../src/utils/validation.ts) — its own `noChildrenTypes` deny-list. This is a **separate** mechanism from `constants/components.ts`'s `canHaveChildren` (an allow-list of container types) — a leaf type needs adding to both.
4. [`src/components/editor/componentIcons.tsx`](../../../src/components/editor/componentIcons.tsx) — icon switch case for the layers/tree view (the palette resolves the `icon:` string dynamically via `LucideIcons[name]`, no code needed there).
5. [`src/utils/layout/engine.ts`](../../../src/utils/layout/engine.ts) — add to `leafTypes`, and to `calculateAutoHeight`'s switch **only if** the type has no explicit numeric `height` in `defaultProps` (e.g. Gauge/Sparkline needed this; Separator/Log/StatusBar didn't, since they set explicit height).
6. [`src/components/editor/Canvas.tsx`](../../../src/components/editor/Canvas.tsx) — a `case` in `ComponentRenderer.renderComponent` (canvas preview), plus `getResizeHandles`: add to the `widthOnlyTypes` array for single-line widgets, leave on the default `['e','s','se']` for 2D panels (Log), or special-case orientation like Separator does.
7. [`src/constants/assets.ts`](../../../src/constants/assets.ts) — put shared rendering logic here **only if** it's genuinely reused across Canvas.tsx + the ANSI renderer + multiple exporters (e.g. `renderGauge`, `renderSparkline`, `tailLines`, `renderStatusBar`). Don't extract for a single caller.
8. [`src/utils/rendering/components.ts`](../../../src/utils/rendering/components.ts) — a **separate** switch/case in the ANSI/text-export renderer (used by `textExporter.ts` for the Export panel's Text/ANSI and Preview tabs). Easy to forget since it's a second rendering pipeline distinct from Canvas.tsx.
9. [`src/components/properties/PropertyPanel.tsx`](../../../src/components/properties/PropertyPanel.tsx) — property controls, either inline or a dedicated `XEditor` function (follow an existing one like `BreadcrumbEditor`/`StatusBarEditor`).
10. All 7 exporters in `src/utils/export/exporters/{ink,bubbletea,blessed,textual,opentui,tview,ratatui}.ts` — see the idiom table below before hand-rolling; check the real framework docs before assuming a primitive doesn't exist.
11. [`src/utils/export/__tests__/fixtures.ts`](../../../src/utils/export/__tests__/fixtures.ts) — add a node to `kitchenSinkTree()` for snapshot + CI toolchain coverage.
12. `todo.md` — mark done with which real APIs were verified and how.

Do one component fully — every point above, CI-verified — before starting the
next.

### Real-toolchain verification

Snapshot tests alone don't prove generated code compiles. After changing an
exporter: `node scripts/generate-export-fixtures.mjs`, then hand the output to
the real toolchain (`cargo build` for Ratatui, `go build`/`go vet` for
Tview, `go test` for BubbleTea, `py_compile` + a headless `run_test()` mount
for Textual, `node --check` for Blessed, `esbuild` for OpenTUI/Ink JSX). CI
(`.github/workflows/ci.yml`) automates all of this on every push — see the
`verify-rust`/`verify-go`/`verify-python`/`verify-node-exports` jobs.

## Component → framework idiom map

Ground truth lives in each exporter's `switch (node.type)` (grep `case '` in
`src/utils/export/exporters/*.ts`). The traps worth knowing before you touch
an exporter:

- **Don't assume a framework lacks a primitive — check.** Three wrong
  assumptions were already baked into this project's own planning doc before
  being caught: Textual *does* have a native `Sparkline` and a native
  `RichLog`; Tview *does* have real `SetScrollable(true)`/`ScrollToEnd()`
  scrollback; Blessed *does* have a native `log` widget with
  `scrollable`/`alwaysScroll`. Verify via docs.rs / textualize.io /
  pkg.go.dev / source, not memory.
- **Textual** has the most native widget coverage: `ListView`, `OptionList`
  (Menu), `DataTable` (Table), `Tree`, `Rule` (Separator), `Sparkline`,
  `RichLog` (Log), `Footer`+`BINDINGS` class attribute (StatusBar),
  `ModalScreen` subclass (Modal). Data widgets get populated in `on_mount`,
  not at construction.
- **Tview** has real `NewList`, `NewTreeView`, `NewTable`, `Pages`+Grid
  centering (Modal — "better than any other exporter can offer for Modal
  today"), `TextView.SetScrollable(true)`+`.ScrollToEnd()` (Log). Watch the
  Box-embedding trap: every primitive is a named var, chained `Set*` calls
  after a `New*()` don't compile the way you'd expect.
- **Ratatui** has real `Gauge::label()`, `widgets::Sparkline` (`.data()`,
  `.max()`), `List`/`Tree`/`Table` widgets. Where a value is only known at
  render time (e.g. Separator's fill-width), the generated Rust reads the
  real `Rect.width`/`.height` field rather than hand-computing it at export
  time.
- **BubbleTea** exporter always produces a **static, single-render-pass**
  program (no Bubble Tea event loop) — this is a deliberate, pre-existing
  constraint, not a gap to fix. Stateful primitives (`bubbles/viewport`,
  `bubbles/help`, `bubbles/textinput`, `bubbles/spinner`,
  `bubbles/progress`) get a static preview plus a
  `// consider charmbracelet/bubbles/X for...` pointer comment. Follow this
  convention for any new stateful component rather than inventing a
  different one.
- **Blessed** and **OpenTUI** hand-roll most data widgets (List/Table/Tree/
  Menu) as styled boxes, but Blessed has real `line` (Separator) and `log`
  (Log), and OpenTUI has a real `<scrollbox>` intrinsic (Log).
- **Ink** hand-rolls everything via `<Text>`/`<Box>` — no native primitives
  for any of the data/display widget types.

## The `.tui` file format

Defined in [`src/utils/fileOps.ts`](../../../src/utils/fileOps.ts):

```json
{
  "version": "1",
  "meta": { "name": "<root node name>", "theme": "<ThemeName>", "savedAt": "<ISO 8601>" },
  "tree": { /* full ComponentNode tree, root is always type 'Screen' */ }
}
```

Plain JSON, `.tui` is just an extension convention (opened via
`showOpenFilePicker`/`showSaveFilePicker` where available, falling back to a
plain `<input type=file>`/download). `openTuiFile` in the same file validates
`version === '1'` and calls `isValidComponentTree` (in `validation.ts`)
before loading — reject/alert on malformed input, don't crash. When bumping
the format (a `version: "2"`), keep loading `"1"` for backward compatibility
rather than a hard cutover.

## Themes and color modes

[`src/stores/themeStore.ts`](../../../src/stores/themeStore.ts) defines
`THEMES`: 10 named 16-color ANSI palettes (`default`, `solarized-dark/light`,
`dracula`, `nord`, `monokai`, `gruvbox`, `tokyo-night`, `nightfox`,
`sonokai`), each an `AnsiColors` record of the 8 base + 8 bright ANSI slots
as hex. `currentTheme` picks the palette; `colorMode` (`ansi16` | `ansi256` |
`truecolor`) is a separate axis controlling how the *export* step degrades
colors — see each exporter's color-tier handling (Ratatui's `Color` enum,
Tview's `tcell.PaletteColor`, Ink's chalk `xBright` suffix, OpenTUI's
`RGBA.fromIndex`). Textual's TCSS ansi16 mode is explicitly deferred (no
established "force to 16 colors" idiom the way the others have one) — see
`todo.md`'s Deferred section before attempting it.
