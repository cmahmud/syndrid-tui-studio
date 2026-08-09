# TUI-Studio + tui-design Skill — Master TODO

Source of truth for enhancing/fixing both tools. Backed by the audit in
[docs/deep_anal_1.md](docs/deep_anal_1.md). Update this file as items land; one PR per item
unless grouped.

Repo setup: fork `discover-dmc/tui-studio` is `origin`; `jalonsogo/tui-studio` is
`upstream` (inactive ~2 months, 7 open PRs). Work on branches off `main`, PR into the fork.

---

## P0 — Correctness (broken today, user-visible)

- [x] **Adopt upstream PR #19** (2026-07-28, merge 9baaa3d): `ExportFormatId` aligned with
  runtime strings, shared `escape.ts` added and wired into Ink/BubbleTea/Textual/Ratatui,
  `type CodeFormat = any` removed, fictional `tview-go` removed, `html` added.
  Solves deep_anal §2.2 wholesale; Textual/BubbleTea now escape strings (structure bugs remain).
- [x] **Adopt upstream PR #20** (2026-07-28, merge c9403f4): complete Ratatui exporter —
  usage-gated imports, Grid layout, Modal centering (saturating u16 math), Spacer/auto
  constraints, 3-digit hex, `Block::new()`, Cargo.toml hint. Also fixed the lint error.
  Conflicts vs #19 resolved: shared `escRust` kept over local copy, README keeps no-Tview line.
- [x] **Rebuild Textual exporter** (2026-07-28, commit 99b476c): new
  `exporters/textual.ts` module — containers → Vertical/Horizontal/Grid with-blocks,
  all 20 component types mapped (ListView, DataTable, Tree, Tabs, ProgressBar, Checkbox,
  RadioButton, Switch, Select, OptionList, LoadingIndicator…), styles → TCSS in `App.CSS`,
  data widgets populated in `on_mount`. Verified: py_compile + live `run_test()` mount
  under real textual. Niceties done 2026-07-28 (commit 7d28e62): `activeTab` set in
  on_mount, `gap` → child margins (`grid-gutter` on Grid), Modal → real `ModalScreen`
  subclass pushed at startup — all runtime-verified.
- [x] **Rebuild BubbleTea exporter** (2026-07-28, commit c648716): new
  `exporters/bubbletea.ts` — lipgloss JoinVertical/JoinHorizontal layout, Grid row
  chunking, gap spacers, full style translation (hex + named-ANSI colors, borders,
  padding), all 20 types, asset presets for spinner/bar, bubbles pointers in comments.
  Verified: gofmt-clean, compiles against real bubbletea+lipgloss, go test executes View().
- [x] **Fix Blessed exporter** (2026-07-28, commit 6e6182a): new `exporters/blessed.ts` —
  runs the studio LayoutEngine and emits absolute positions matching the canvas, real
  widget types, collision-safe vars, colors/labels/borders. Runtime-verified against real
  blessed under a pty (clean init, q-to-quit, exit 0).
- [x] **Fix OpenTUI exporter** (2026-07-28, commit 6e6182a): rewritten against the real
  `@opentui/react` API (lowercase box/text/input/select/tab-select intrinsics, Yoga
  flexbox with flexGrow for fill, strong/em/u modifiers, createCliRenderer bootstrap).
  Content no longer dropped; TSX esbuild-verified.
- [x] **Surface unsupported features** (2026-07-28): `getExportWarnings(root, format)` +
  amber banner in the export panel; BubbleTea skips Modals with a NOT-exported header
  comment and warns on fill sizing instead of silently degrading.
- [x] **Ink borderColor bug** fixed (2026-07-28, commit 208b511).
- [x] ~~Gate broken exporters in the UI~~ — obsolete: all exporters rebuilt (2026-07-28);
  unsupported features surface via the warnings banner instead.
- [x] **Fix lint failure**: resolved by PR #20's eslint-disable on `RatatuiExportSettings`
  (2026-07-28). `npm run lint` is clean.
- [x] **Validate `.tui` file on open** (2026-07-28, commit 175cb27): added
  `isValidComponentTree` to [validation.ts](src/utils/validation.ts) — recursively checks
  required fields and validates `node.type` against real `COMPONENT_LIBRARY` keys.
  `openTuiFile` now rejects malformed trees with the existing alert instead of crashing.
  Verified against good/malformed fixtures (bad type, non-array children, malformed child).
- [x] **3 real layout-engine bugs found via first real MCP dogfooding** (2026-07-30):
  surfaced building an actual dashboard (tracklistify project) through the Phase
  1-4 MCP tools, not synthetic testing — an agent naturally declares explicit
  sizes and nests data widgets in ways the human drag-and-drop UI rarely
  exercises, since palette-added components always carry a literal `'auto'`
  width/height from `COMPONENT_LIBRARY` defaults.
  1. **Crash**: nesting a data widget (e.g. `Table`) with no explicit
     width/height inside a `Box` crashed `render_preview` with `RangeError:
     Invalid count value: -1`. Root cause, confirmed via direct repro (real
     stack trace landing on `renderTable`
     [components.ts:507](src/utils/rendering/components.ts:507)):
     [flexbox.ts](src/utils/layout/flexbox.ts)'s `calculateFlexboxLayout`
     hardcoded `minWidth: 1, minHeight: 1` on every flex item, which made
     `resolveWidth`/`resolveHeight`'s existing `item.minWidth || 10` /
     `|| 3` fallback dead code (1 is truthy) — an unsized child collapsed to
     1x1, then its own border subtraction went negative. Fixed by reading the
     real, already-typed-but-previously-unused `ComponentProps.minWidth`/
     `minHeight` fields instead of the hardcoded 1, letting the intended
     10/3 fallback actually fire. Confirmed via `npx vitest run` that the
     repro no longer throws; 3 pre-existing Blessed snapshot tests changed
     (every unsized element's baked-in `width`/`height` literal moved from
     the broken 1/1 to the intended 10/3, with cascading position shifts) —
     reviewed each diff, all consistent with the fix, updated via `-u`.
     Real-toolchain re-verified (`node --check` on all 4 Blessed variants).
  2. **Silent data loss**: `add_component`'s explicit `height` override on a
     `Box` got silently reset to `'auto'` the moment any child was added
     into it — a pre-existing "auto-grow an empty container to fit its
     first child" heuristic in
     [treeUtils.ts](src/utils/treeUtils.ts)'s `applyAddComponent` that fires
     on *every* add, not just the first, clobbering deliberate sizing.
     Removed entirely rather than narrowed to "first child only," since
     that would've still broken the exact reported case (an agent setting
     an explicit height then immediately populating it) — the app's
     existing Layout Warning system (overflow/negative-space) is the right
     place to surface a too-small container, not a silent implicit resize.
  3. **Cosmetic gap**: `renderList` was missing the final
     `.slice(0, contentArea.width)` clamp that `renderTable` already has —
     hardened for consistency, though the *confirmed* mechanism behind the
     reported "content overflows the border" symptom is deeper (see below).
  **Fixed in the Syndrid fork (2026-08-09)** — terminal width is now
  measured in display cells rather than JavaScript UTF-16 length. The shared
  width helper handles grapheme clusters, combining marks, wide CJK/emoji,
  whole-grapheme slicing/padding, and `CharCanvas` continuation cells. Canvas
  overwrite handling also clears the owner of a previously drawn wide glyph,
  preventing stale half-glyph collisions. The renderer, layout intrinsics,
  tables/lists, borders and browser preview now use the same cell-width model.

## P1 — Export parity & quality

- [x] **Tview implemented for real** (2026-07-28, commit 6e90ade): new
  `exporters/tview.ts` against the verified real `rivo/tview` + `gdamore/tcell/v2`
  API (pkg.go.dev + source-level checks for tag-parsing behavior, not guessed).
  Handles tview's real constraints: Box-embedding return-type chaining trap (every
  primitive is a named var, no chained Set* calls), tag-escaping rules that differ
  per widget (List parses `[tags]`, Table/TreeView never do — `tview.Escape()`
  applied uniformly since it's a harmless no-op elsewhere), the inverted
  FlexRow/FlexColumn naming, and tcell.GetColor's native hex+W3C-name resolution
  (only ANSI "bright" variants needed a manual palette-index map). Modal gets real
  support via `tview.Pages` + a Grid-centering wrapper — better than any other
  exporter can offer for Modal today. `ExportFormatId`, dropdown, extension,
  README table all updated. Verified: `go build` + `go vet` against the real
  packages (not just snapshots), plus a new CI step (`go-check-tview` in the
  `verify-go` job) doing the same on every push.
- [x] **Shared exporter architecture** (2026-07-28, commit d526a02): extracted Ink into
  `exporters/ink.ts` (the last one still inline in codeExporter.ts) and added
  `exporters/shared.ts` — consolidates logic that was genuinely duplicated across 3+
  files (a byte-identical ident generator in tview/blessed/bubbletea, ANSI16 name/index
  table, hex-nearest-neighbor matcher, gradient fallback). Deliberately did NOT build a
  single universal tree-walker/widget-map abstraction across all 7 languages — Rust
  widget dispatch, Python containers, Go Box-embedding chains, and JSX nesting are
  different enough that forcing one shape would be the premature abstraction the audit
  originally warned about. Consolidated only what was concretely duplicated.
- [x] **Wire ExportSettings into the UI** (2026-07-28, commit d526a02): deleted the fully
  dead `ExportSettings`/6 subtypes/`ExportFormat`/`ProjectExportData` (verified zero
  consumers anywhere). Replaced with one real, wired setting — see color-tier below —
  rather than resurrecting speculative fields (`indentSize`, `useAsyncIO`, etc.) that
  were never implemented and don't obviously matter to users.
- [x] **Color-tier degradation in code exports** (2026-07-28, commit d526a02): real
  `truecolor | ansi16` mode, dropdown in the export panel, threaded through
  `exportToCode`. Every exporter except Textual (TCSS ansi16 needs separate design,
  excluded rather than faked — see "Deferred" below). Each language verified against real
  docs: Ratatui's Color enum table, lipgloss indexed color strings, Tview's
  `tcell.PaletteColor` (chosen over `GetColor` since palette-index is the only
  guaranteed-adaptive form), Ink's chalk `xBright` suffix (verified distinct from the
  `brightX` prefix used elsewhere), OpenTUI's real `RGBA.fromIndex` API instead of a
  hex guess.
- [x] **Export snapshot tests** (2026-07-28, commit e36c799): vitest added (native Vite 7
  compat). Snapshot coverage of all 6 code formats × 3 fixtures (kitchen-sink, empty
  screen, text-only) in `src/utils/export/__tests__/`. Plus explicit regression assertions
  locking in this session's fixes (Blessed var collision, Textual indentation, OpenTUI
  content/intrinsics, Ink borderColor, Ratatui import gating, BubbleTea warnings).
  Compile-checking generated output in CI (rustc/go/python) is done — see the CI section.
- [x] **Round-trip fidelity pass** (2026-07-28, commit d526a02): audited padding/gap/
  justify/align/borders/gradients against every exporter, fixed real gaps —
  background gradient now degrades everywhere to its first stop as a flat color (with
  a warning) instead of being silently dropped; OpenTUI/BubbleTea translate
  justify/align to real Yoga props / lipgloss Join position; Ratatui emulates justify
  with `Constraint::Fill(1)` spacers and gets real gap via `Layout::spacing()`; Tview
  gets gap via a spacer Box (Flex has no native gap). Surfaced two real bugs, both
  fixed + regression-tested: Ratatui was skipping the Block entirely for an unbordered
  background-only container (nothing painted); Textual was emitting our internal
  color names ("brightGreen") as literal TCSS, which doesn't parse — real
  `ansi_bright_green` convention verified and wired in. Deferred: Tview/Blessed/Textual
  justify-content-style space distribution beyond what's listed above (no clean 1:1
  mapping in those layout models — see "Deferred" below).

## Deferred (deliberate, not forgotten)

- **Textual ansi16 color mode**: TCSS has its own `ansi_*` named-color convention
  (verified this session, now used for truecolor named-color translation) but no
  established "force everything to 16 colors" idiom the way `tcell.PaletteColor` or
  `RGBA.fromIndex` do for the other exporters — needs its own design pass, not a
  copy-paste of the pattern used elsewhere.
- **Tview/Blessed justify-content-style space distribution** (center/space-between
  distributing extra space, not just cross-axis align): Blessed doesn't need it — the
  LayoutEngine already bakes justify into absolute positions. Tview's Flex has no
  built-in weighted-space-distribution primitive; would need the same
  Fill-spacer-emulation technique Ratatui got, just not done yet.
- **Textual justify/align**: Textual's `align: <h> <v>` positions a container's
  children as one block, not a per-item distribution — doesn't map to CSS
  justify-content at all without a structural rework.

## P2 — Editor UX & robustness

- [x] **Autosave** (2026-07-28, commit 8913271): `src/utils/autosave.ts` subscribes to
  componentStore and debounce-writes `{version, meta:{theme}, tree}` to localStorage
  (reuses fileOps.ts's exact .tui shape). Restores silently on load — no prompt, matching
  Figma/Excalidraw/VS Code — validated through the same `isValidComponentTree` check used
  for opened .tui files. Plain manual localStorage read/write, not zustand persist
  middleware (nothing else in the codebase uses that pattern). Verified end-to-end in the
  browser: add component → wait past debounce → confirm write → reload → confirmed restored.
- [x] **Flexbox `stretch` sizing** (2026-07-28, commit 4025525): an item with
  `align: 'stretch'` and no explicit cross-axis size now fills the container's cross
  dimension (real CSS semantic) instead of a no-op default. Explicit sizes still win;
  limited to the common single-line case (multiple wrapped lines can't each stretch to
  the full container without overlapping). Verified directly against
  `calculateFlexboxLayout`; `src/utils/layout/__tests__/flexbox.test.ts` added.
- [x] **Canvas.tsx decomposition** (2026-07-28, commits 850f055, current): arrow-key nudge
  extracted verbatim into `useCanvasKeyboardNudge` (`src/hooks/useCanvasKeyboard.ts`), then
  selection/hover/context-menu extracted into `useComponentSelection` and
  drag-reorder/reparent/resize extracted into `useComponentDrag`
  (`src/hooks/useComponentSelection.ts`, `src/hooks/useComponentDrag.ts`). `Canvas.tsx` shed
  ~210 lines. Correction to an earlier note here: the "nudge doesn't move anything" finding
  (`task_61c608d2`) was a false positive — the browser automation tool used to test it
  dispatches synthetic keydown/mouse events with empty `key`/`code`, which the app's own
  `.includes(e.key)` guard correctly rejects. Dispatching a real `KeyboardEvent`/`DragEvent`
  confirms nudge, resize, click-select, hover ring, context menu, and drag reorder/reparent
  all work correctly; task dismissed as non-issue.
- [x] **Toolbar.tsx / ComponentToolbar.tsx decomposition** (2026-07-28, commit f4b6a59):
  `Toolbar.tsx` was a 944-line kitchen sink of independent modals + the app menu — split
  into `SaveDialog.tsx`, `ChangelogModal.tsx`, `HelpModal.tsx`, `AboutModal.tsx`,
  `SettingsModal.tsx`, `AppMenu.tsx`, plus shared `useEscapeKey` hook and `accentColor.ts`
  utils. `Toolbar.tsx` now just wires them together (944 → 195 lines). `ComponentToolbar.tsx`
  is one cohesive component (not independent pieces), so only extracted the genuinely
  self-contained drag-to-reposition/preset-position logic into `useToolbarPosition` and its
  static data into `constants/componentToolbar.ts` (697 → 506 lines); left the
  dropdown/hotkey/dock-mode render logic in place rather than force a split that would add
  risk without reducing complexity. Verified in-browser: app menu, all 5 modals, accent
  color live-apply, dock/undock round-trip, drag-reposition, position presets, and group
  dropdown add-component all confirmed working post-split.
- [x] **Code-split the bundle** (2026-07-28, commit 104c8ba): `ExportModal` (75KB — bundles
  all 7 exporters) and `CommandPalette` (4.9KB) converted to `React.lazy()`, gated at the
  JSX call site by their own `isOpen`/`open` flag so the dynamic import only fires on
  first actual open. Verified: build output shows them as separate chunks; both open
  correctly in the browser post-split.
- [x] **Cross-window event cleanup** (2026-07-28, commit 2bdef6d): new `src/stores/uiStore.ts`
  replaces `toolbar-docked-changed`, `open-save-dialog`, `command-export/settings/help/
  changelog/about`, and `open-command-palette` — 6 booleans + 7 window-event effects in
  Toolbar.tsx alone collapse into 3 store selectors (`toolbarDocked`, `commandPaletteOpen`,
  `activeDialog: DialogName | null`). Surfaced and fixed a dead wire along the way (command
  palette's Save action fired an event nothing listened for); deliberately left the
  Copy/Paste menu items' identical dead-wire bug alone (flagged separately as
  `task_7b18da74` — needs new clipboard plumbing, not just an event-to-store swap).
  Verified in the browser: every dialog opens via shortcut + app menu, dock toggle
  round-trips between producer and both consumers, survives reload.
- [x] Spinner + progress bar asset libraries (2026-07-28, commit 7e579fe): 46 cli-spinners
  presets (terminal-safe subset) and 13 bar charsets incl. smooth eighth-block partials, in
  `src/constants/assets.ts`; wired through canvas, export renderer, PropertyPanel dropdowns,
  Ink (ink-spinner type passthrough) and Ratatui exporters.
- [x] Animate spinner preview on canvas (2026-07-28, commit dcdf514): `ComponentRenderer`
  ticks a local `spinnerFrame` state via `setInterval` at the preset's real interval,
  scoped per-instance. `node.props.frame` (the exporters' static frame) is untouched —
  purely a canvas preview concern. Verified live: sampled the rendered glyph twice ~300ms
  apart and confirmed it changed.

## P3 — Housekeeping

- [x] **Delete dead `wailsjs/`** (2026-07-29, commit 34875aa): confirmed zero references
  anywhere in src/, package.json, or vite.config.ts before removing.
- [x] **Delete stale `docs/TUI_DESIGNER_*` planning docs** (2026-07-29, commit c365cdd):
  5 pre-implementation files (dated 2026-02-09, "working title"), only cross-referenced each
  other, not linked from README/CLAUDE.md/code. Deleted outright (git history keeps them if
  ever needed) rather than archived.
- [x] **Sync `package.json` version with CHANGELOG** (2026-07-29, commit 574b1e8): was stuck
  at `0.0.1` vs CHANGELOG's `0.3.6` — also fixes the About dialog's version display, which
  reads `__APP_VERSION__` from `package.json` at build time (a real, if minor, user-visible bug).
- [x] Commit pending `react-router-dom` removal (2026-07-28)
- [x] **`.gitignore`: add + untrack `tsconfig.tsbuildinfo`** (2026-07-29, commits 574b1e8,
  2eb46ca). Upstream PR #16 not adopted separately — same outcome achieved directly.
- [x] **`.claude/launch.json`** — already existed from an earlier session (commit 7e579fe);
  confirmed present and correct, no new work needed.
- [x] **`npx update-browserslist-db`** (2026-07-29, commit 574b1e8): caniuse-lite refreshed,
  build warning gone.
- [x] **README export-framework claims** (2026-07-29, commit b680d0e): the export table itself
  was already accurate (all 7 exporters fixed in P0/P1) — nothing to change there. Found and
  fixed a related real bug instead: the clone URL and Issues link both pointed at the inactive
  `jalonsogo/tui-studio` upstream instead of this fork.

## P4 — Component wishlist (new component types)

Extracted from P2 (2026-07-29) — bigger than a line item. Every new `ComponentType` touches
all of: `types/` (union + prop types), `constants/components.ts` (`COMPONENT_LIBRARY` entry:
defaultProps/defaultLayout/defaultStyle/defaultEvents), canvas rendering
(`Canvas.tsx`'s `ComponentRenderer.renderComponent` switch + any layout-engine auto-size
special case), property editing (`PropertyPanel`/`LayoutEditor`/`StyleEditor` — type-specific
controls), and all 7 exporters (Ink, BubbleTea, Blessed, Textual, OpenTUI, Tview, Ratatui) —
each needs real, verified support per this session's standing rule (check the actual
framework API/docs, don't guess), plus export-fixture/CI coverage. That's ~10 touch points
per component. Do one component fully — every touch point, CI-verified — before starting the
next, matching the "finish a section before moving on" preference from this session.

Suggested order (simplest/most-reusable first, to prove the full pipeline cheaply):

- [x] **Separator / Rule** (2026-07-29): horizontal/vertical divider line, `lineStyle`
  single/double/thick/dashed. New `ComponentType`, `COMPONENT_LIBRARY` entry, canvas render
  case (+ orientation-aware resize handles: width-only when horizontal, height-only when
  vertical), PropertyPanel orientation/lineStyle controls, ANSI/text-export renderer case,
  and all 7 code exporters. Verified real per-framework APIs rather than guessing: Textual
  has a native `Rule` widget (`orientation`/`line_style`, confirmed via
  textual.textualize.io) — used directly, and its real headless mount was tested (`Rule`
  actually mounts and unmounts cleanly). Blessed has a native `line` widget (verified from
  its source: `orientation` + a `ch` fill-character option) — used directly. Ratatui,
  Tview, BubbleTea, OpenTUI, and Ink have no native rule primitive (confirmed — e.g.
  docs.rs/ratatui has no `Rule` widget) — all hand-roll a repeated line character; Ratatui's
  version is notable since width/height aren't known at export time, so the generated Rust
  reads the real `Rect.width`/`.height` field at render time (`"─".repeat(area.width as
  usize)`) rather than baking in a static guess. All 7 exporters' generated output was
  handed to its real toolchain (not just snapshot strings): `cargo build` (3 Ratatui
  variants), `go test`/`go build`+`go vet` (3 BubbleTea + 3 Tview variants), `py_compile` +
  a real headless Textual mount (2 variants), `node --check` (3 Blessed variants), and
  `esbuild --jsx=automatic` (6 OpenTUI/Ink variants) — all passed. Also verified live in the
  browser: add via palette, orientation/lineStyle controls, canvas rendering (horizontal +
  vertical + all 4 line styles), resize-handle restriction, and both the Text/ANSI and Code
  export tabs (Textual `Rule.vertical(line_style="double")`, Ratatui's runtime-width
  expression) end to end.
- [x] **Gauge (labeled)** (2026-07-29): ProgressBar-like widget with a `label`, overlaid/centered
  on the bar rather than trailing it — real per-framework APIs verified rather than assumed.
  Ratatui uses its native `Gauge::label()` directly (confirmed via docs.rs — replaces the
  default percentage text, exactly the feature that makes Gauge distinct from a re-skinned
  ProgressBar). Textual's `ProgressBar` has no free-text label slot (confirmed via its docs),
  so it composes `Horizontal(Static(label) + ProgressBar)` — the same pattern this file
  already uses for a labeled Toggle. BubbleTea/Tview/Blessed/OpenTUI/Ink have no gauge
  primitive, so they share one new helper, `renderGauge()` (`constants/assets.ts`), which
  splices the label text into the center of a rendered bar — mirroring how ratatui's real
  `Gauge::label()` behaves and how terminal resource meters (htop/btop) typically render.
  Also required layout-engine changes ProgressBar already needed (leaf auto-height,
  width-only resize handle) since Gauge follows the same no-explicit-height convention.
  All 7 exporters' generated output verified against real toolchains (cargo build, go
  test/build+vet, py_compile + a real headless Textual mount, node --check, esbuild) — the
  Textual variant's `Horizontal(Static+ProgressBar)` mounted cleanly. Verified live in the
  browser: add via search, Label/Value/Max/Style/Show-percentage controls, canvas rendering,
  width-only resize, and the Ratatui code export tab showing the real
  `Gauge::default().ratio(0.450).label("CPU 45%")` call.
- [x] **Sparkline** (2026-07-29): inline mini bar chart from a numeric series (`data`, optional
  `max`). Correction to this item's own assumption: **Textual also has a native `Sparkline`
  widget** (confirmed via textual.textualize.io/widgets/sparkline) — used directly
  (`Sparkline(data, summary_function=max)`), not hand-rolled like originally guessed. Ratatui
  uses its real `widgets::Sparkline` (`.data(&[u64...]).max(n)`, confirmed via docs.rs; values
  rounded/clamped to u64, direction left at its documented default rather than specified).
  BubbleTea/Tview/Blessed/OpenTUI/Ink have no native primitive, so they share one new helper,
  `renderSparkline()` (`constants/assets.ts`) — buckets the series into `width` columns
  (max-per-bucket, matching Textual's own `summary_function=max` convention) and maps each to
  one of the 8 eighths-block levels (▁▂▃▄▅▆▇█), the same default character set ratatui's real
  Sparkline uses (`symbols::bar::NINE_LEVELS`). All 7 exporters' generated output verified
  against real toolchains (cargo build, go test/build+vet, py_compile + a real headless
  Textual mount, node --check, esbuild) — the Textual variant mounted the real Sparkline
  widget cleanly. Verified live in the browser: add via search, editable comma-separated data
  field, canvas rendering (both the default upsampled data and a hand-entered triangular
  series), width-only resize, and both the Textual and Ratatui code export tabs showing the
  real widget calls.
- [x] **Log / viewport** (2026-07-29): scrolling log/output panel (`lines: string[]`). Real
  per-framework primitives verified — more frameworks had native support than this item's own
  original guess assumed. Textual's real `RichLog` (`.write()` per line in `on_mount`).
  Blessed's real `log` widget (`scrollable: true, alwaysScroll: true` — genuine tail-scroll,
  not hand-rolled). Tview's real `TextView.SetScrollable(true)` + `.ScrollToEnd()` (confirmed:
  "discards lines moving out of the visible area at the top" — an actual native log-tail
  mechanism, not a guess). OpenTUI's real `<scrollbox>` intrinsic (confirmed via
  opentui.com/docs/components/scrollbox). Only BubbleTea and Ink have no native fit: BubbleTea
  gets a static preview + a `bubbles/viewport` pointer comment (matching this file's existing
  convention for Spinner/ProgressBar); Ink hand-rolls a `Box` column of `Text` lines. Ratatui
  uses a real multi-line `Paragraph` — since both content and height are known at export time,
  the visible tail is pre-sliced there rather than using Paragraph's real runtime `.scroll()`
  offset (which would only matter if content could still change after export). All 7
  exporters' generated output verified against real toolchains (cargo build, go
  test/build+vet, py_compile + a real headless Textual mount, node --check, esbuild) — the
  Textual variant's real `RichLog` mounted cleanly. Verified live in the browser: add via
  search, editable "one per line" textarea, canvas rendering (bottom-anchored tail), full
  resize (unlike the single-line Gauge/Sparkline/ProgressBar, Log resizes in both axes), and
  the Textual/Tview code export tabs showing the real widget calls.
- [x] **StatusBar / footer keybinding hints** (2026-07-29): bottom bar showing keybindings
  (`items: { key, label }[]`, e.g. `^Q Quit  ^S Save`). Resolved this item's own open design
  question — decided a real `ComponentType` over Box+Text composition specifically *because*
  two frameworks have a genuinely more powerful native mechanism a generic composition could
  never produce: Textual's real `Footer` widget auto-renders from a `BINDINGS` class attribute
  (confirmed via textual.textualize.io/widgets/footer) — used directly, generating a real
  `BINDINGS = [("ctrl+q", "exit", "Exit"), ...]` list on `MyApp` (our "^Q" caret notation is
  converted to Textual's real "ctrl+q" key-name convention; each label is slugified into a
  Python-identifier-safe action name — no matching `action_*` methods are required for the
  app to mount, confirmed by the real headless mount test). BubbleTea's `bubbles/help`
  package (`key.Map`/`ShortHelp()`) is the analogous real primitive there, but — matching
  this file's existing Spinner/ProgressBar convention — gets a static preview + a pointer
  comment rather than a live keymap, since help.Model needs a running Bubble Tea program to
  drive it. The other 5 frameworks have no comparable primitive, so they share one new
  helper, `renderStatusBar()` (`constants/assets.ts`), joining key+label pairs with
  gap-separated spaces. All 7 exporters' generated output verified against real toolchains
  (cargo build, go test/build+vet, py_compile + a real headless Textual mount, node --check,
  esbuild) — the Textual variant's real `Footer`+`BINDINGS` mounted cleanly with no stub
  action methods defined, confirming the earlier hypothesis. Verified live in the browser:
  add via search (Navigation category), a key/label items editor (add/edit/remove), canvas
  rendering (full-width colored bar), width-only resize, and the Textual code export tab
  showing the real `BINDINGS`/`Footer()` output with a live-edited label reflected in both
  the binding description and its auto-generated action name.

This closes out the P4 component wishlist (Separator, Gauge, Sparkline, Log, StatusBar) that
this file's own P2 wishlist entry was extracted into — see the P4 section above for the full
per-component breakdown and verification notes.

## Wishlist — unscoped ideas

Lower-confidence or exploratory ideas, not yet sized or committed to a priority tier.

### AI integration — let any capable model design TUIs via API

Raised 2026-07-29, fleshed out 2026-07-29 into achievable phases after
researching how existing LLM-facing TUI tooling keeps a model on-track
(`gfargo/tui-design-skill`'s reference-loaded-on-demand structure; Hyperbliss's
`ghostty-automator` screen-state-introspection loop — see `docs/design_anal.md`
and `.claude/skills/tui-studio/SKILL.md`). Goal: an agent — not just this one,
any capable model via a documented API — can manipulate an sTUIdio design
directly (add/edit/query components) alongside or instead of a human, not
just via one-shot export. Viable today: the component tree is already a
clean JSON structure (`ComponentNode`) mutated through a small, well-defined
action API on `componentStore` (`addComponent`, `updateProps`, `updateLayout`,
`moveComponent`, `removeComponent`, plus existing undo/redo history as a
safety net), and `.tui` save/open already round-trips the whole tree.
`isValidComponentTree` (`src/utils/validation.ts`) already exists as a
ready-made guardrail. Phased so each phase is independently shippable and
testable, matching this project's "finish a section before moving on" habit:

- [x] **Phase 1 — MCP server + transport bridge** (2026-07-30): an MCP
  server whose 8 tools map ~1:1 onto existing `componentStore` actions
  (`add_component`, `update_props`, `update_layout`, `move_component`,
  `remove_component`, `get_tree`, `list_component_types`,
  `get_component_schema`), bridged to the live browser tab over a small
  local WebSocket (the app had no backend before this — first one). MCP
  tool calls are pull/turn-based (agent asks, gets state, acts), not a push
  feed, so "co-creation" in practice is turn-taking — the agent catches up
  on human edits by calling `get_tree` each turn, not by watching them
  happen live.
  New standalone process `mcp-server/index.mjs` (plain ESM, no build step —
  `node mcp-server/index.mjs`, identical invocation on Windows/macOS/Linux):
  spawned over stdio by an MCP client (`McpServer` +
  `StdioServerTransport` from `@modelcontextprotocol/sdk`, version verified
  against the real published npm package — `1.30.0` — rather than assumed),
  and opens a `ws` WebSocket server on `127.0.0.1:5175` (loopback only, pure
  JS, no native addons) for the browser tab to connect to. New
  `src/utils/mcpBridge.ts` is the browser side — same module-level
  singleton, non-hook `getState()` pattern as `autosave.ts`/`fileOps.ts` —
  dispatching each incoming action to the real `componentStore` actions
  (not a new mutation path), building new nodes the same way `App.tsx`'s
  `handleAddComponent` already does (`COMPONENT_LIBRARY[type]` defaults
  merged with overrides). Every mutating call resolves `id`/`parentId`
  first for a clear error instead of the store's silent no-op, then runs
  `isValidComponentTree` on the resulting tree as a defensive backstop —
  `undo()` + error if it somehow fails — and every change rides the
  existing undo/redo stack, no new safety mechanism. New "Agent Bridge"
  toggle in Settings (reuses the existing Light/Dark toggle-switch markup),
  persisted the same way `toolbarDocked` already persists, auto-reconnects
  on load if left enabled.
  Verified for real, not just typechecked: `npx tsc -b`/`npm run
  lint`/`npm run build` clean; a throwaway MCP `Client` +
  `StdioClientTransport` test script confirmed the real protocol handshake,
  all 8 tools listed, and a clean "No sTUIdio browser tab connected" error
  when none is; with the Vite dev server running and Agent Bridge enabled
  in Settings (confirmed "Connected" in the UI), the same test script drove
  `get_tree` → `add_component` → `update_props` → `add_component` →
  `move_component` → `get_tree` → `remove_component` → an intentionally bad
  `add_component` (unknown type, confirmed clean error) against the live
  tab, with every step confirmed via the actual rendered canvas and Layers
  panel; Cmd+Z on the live tab correctly undid the agent's last mutation,
  proving it rode the real history stack.
  **Fix (2026-07-30, found via real `claude mcp add stuidio -- node
  mcp-server/index.mjs` usage, not synthetic testing):** the `WebSocketServer`
  had no `error` handler, so a second instance colliding on port 5175 (a
  reconnect, a health check, a manually-started copy while the MCP-client-
  spawned one is already running) threw an unhandled `EADDRINUSE` and killed
  the whole process — including its already-established MCP stdio
  connection, surfacing to the client as `MCP error -32000: Connection
  closed`. Reproduced directly (`node mcp-server/index.mjs` while another
  instance already held the port — confirmed the exact crash + stack trace),
  fixed by adding `wss.on('error', ...)` so a bind failure logs a clear
  message and degrades (tool calls report "no browser tab connected" instead
  of the connection dying) rather than taking the process down. Re-verified
  the same collision no longer crashes (clean log, no stack trace), and
  confirmed `claude mcp list` reports `stuidio: ✔ Connected` afterward.
- [x] **Phase 2 — guardrail skill for the *consuming* model** (2026-07-30):
  new `.claude/skills/stuidio-skill/` (sibling to `.claude/skills/tui-studio/`,
  companion — that one covers editing this codebase, this one covers
  *using* the Phase 1 MCP tools). Mirrors `gfargo/tui-design-skill`'s proven
  shape: a compact top-level `SKILL.md` (component vocabulary generated from
  the real `COMPONENT_LIBRARY` — not hand-typed, so it can't drift; the
  turn-based tool workflow from Phase 1; hard constraints) plus two
  purpose-built on-demand reference files rather than pointing at
  `docs/design_anal.md` wholesale (that doc is a competitive-analysis
  narrative, not agent-facing reference — extracting just what's needed
  keeps the on-demand load surgical, matching the proven shape's actual
  intent):
  - `references/layout-patterns.md` — the 7 canonical archetypes, each
    cross-referenced to its real `src/constants/templates.ts` template id
    (built in item 7 above) as a concrete example.
  - `references/keybinding-conventions.md` — the exact 3 presets
    (`handleFzfKeys`/`handleLazygitKeys`/`handleHelixKeys`) pulled from
    `PropertyPanel.tsx`'s real `KEYBINDING_PRESETS`, not re-invented.
  - Per-framework export idioms aren't duplicated at all — `SKILL.md` links
    directly to `tui-studio/SKILL.md`'s existing "Component → framework
    idiom map" section, since that content already exists and duplicating
    it would just be a second copy to drift out of sync.
  The hard-constraints section documents a real gap between "structurally
  valid" and "correct" that `isValidComponentTree` can't catch: `List`/
  `Tree`/`Table`/`Menu`/`Breadcrumb` structurally pass `canBeChild` as
  parents (only `Modal`→`Box`/`Grid`/`Text` and `Tabs`→`Box` are actually
  restricted in `validation.ts`), but nothing renders or exports a child
  nested under them — their real content is `props.items`/`columns`+`rows`,
  not the `children` array. Also documents the absolute-root/flexbox-inside
  layout split from Phase 1's own `add_component` handling. Verified by
  invoking the `Skill` tool and confirming `stuidio-skill` is discovered
  with its frontmatter description surfaced correctly; the component table
  was generated directly from `COMPONENT_LIBRARY` via a throwaway script
  rather than copied by hand, so all 27 real types/categories/descriptions
  are accurate as of this commit.
- [x] **Phase 3 — self-verification loop** (2026-07-30): new read-only
  `render_preview` MCP tool (`format: 'text' | 'ansi'`, default `'text'`)
  returning the exact same output the app's own Export panel Preview/Text
  tab produces, so the agent can inspect its own result and correct course
  without a human relaying a screenshot — the same "design → build → see →
  fix" loop Hyperbliss's `ghostty-automator` provides for hand-written TUI
  code, applied to sTUIdio's own tree state instead. Cheap to build since
  the render pipeline already existed: reused `exportToText`
  (`src/utils/export/textExporter.ts`, which itself calls `renderTree` →
  the real `layoutEngine` + `CharCanvas`/`renderComponent` pipeline) as-is
  — no new rendering path. Uses `canvasStore`'s width/height (the same
  dimensions the human-facing Export panel already renders against), not
  `root.props`. `mcp-server/index.mjs`'s generic tool-response wrapper
  needed one small change: a string result (this tool) is returned as raw
  text; every other tool's structured object result is still
  `JSON.stringify`'d as before.
  Verified for real: `npx tsc -b`/`npm run lint`/`npm run build`/
  `node --check mcp-server/index.mjs` all clean; with the bridge connected
  to a live tab holding a real tree (Box containing a Text node), a
  throwaway MCP test client's `render_preview` output was compared
  byte-for-byte against the same tab's own Export panel "Plain Text" tab
  output (via `get_page_text`) — identical, confirming this is a faithful
  passthrough of the existing renderer, not a new one.
- [x] **Phase 4 — dry-run / diff preview** (2026-07-30): all 5 mutating MCP
  tools (`add_component`, `update_props`, `update_layout`, `move_component`,
  `remove_component`) now accept an optional `dryRun: true` — computes the
  would-be tree and returns a unified diff (via the `diff` npm package's
  `createPatch`, verified against its real current API before use — v9.0.0)
  without committing anything, mirroring how coding agents show a diff
  before writing a file.
  Built exactly as scoped — "no new store mechanism, just a compute-don't-
  commit path through the same reducers" — via a real refactor, not a
  parallel reimplementation: the mutation logic inside `componentStore.ts`'s
  `addComponent`/`removeComponent`/`updateProps`/`updateLayout`/
  `moveComponent` actions was factored out into 5 pure functions
  (`applyAddComponent` etc., new in `src/utils/treeUtils.ts`) that take the
  current root and return a would-be new root without touching the store.
  The store actions now call these same pure functions, then `set()` +
  `saveHistory()` — identical behavior, single source of truth. The
  dry-run path in `src/utils/mcpBridge.ts` calls the exact same pure
  functions and just never calls `set()`, so a dry run has zero footprint:
  no store mutation, no undo/redo entry, nothing visible in the live tab.
  Rejected the alternative of commit-then-`undo()`: it would flash the
  change on screen for a frame and leave a stray entry in the redo stack —
  a real side effect, not a true dry run.
  Verified for real: `npx tsc -b`/`npm run lint`/`npm run build`/
  `npx vitest run` (all 75 existing tests, none touching componentStore
  directly but exercising code paths that depend on it, still pass — no
  behavior regression from the refactor) all clean. A throwaway MCP test
  client confirmed, against a live tab: a dry-run `update_props` returns a
  correct diff and leaves the tree completely unchanged (checked via a
  follow-up `get_tree`); a dry-run `remove_component` on a `Box` with a
  child shows the full subtree removal in the diff while the `Box` remains
  present afterward; a dry-run with no actual change returns `(no
  changes)`; a real (non-dry-run) `update_props` immediately after commits
  normally; Cmd+Z on the live tab correctly undid only the real change,
  confirming the preceding dry runs left no history entries. Also updated
  `.claude/skills/stuidio-skill/SKILL.md` (frontmatter tool count/list was
  already stale from Phase 3's `render_preview` addition — fixed both at
  once) to document `dryRun` and `render_preview` in the recommended turn
  loop.
- [x] **MCP tool-surface completeness pass** (2026-07-30, from real
  dogfooding feedback after Phases 1-4): 7 new tools, taking the surface
  from 9 to 16. Not part of the original 5-phase plan — an addendum from
  actually using the thing.
  1. `get_layout_warnings` — exposes `layoutEngine.getNodesWithWarnings()`/
     `getDebugInfo()` (the exact detection behind the human UI's "N Layout
     Warnings" banner) so an agent gets a structured overflow/negative-space
     signal instead of eyeballing `render_preview`'s text output — directly
     relevant to the 3 layout bugs found in the same dogfooding session.
  2. `duplicate_component` / `group_components` / `ungroup_components` —
     the 3 remaining `componentStore` actions Phase 1 hadn't mapped yet.
     Refactored the same way Phase 4 refactored the other 5: pure functions
     (`applyDuplicateComponent`/`applyGroupComponents`/
     `applyUngroupComponents`, new in `treeUtils.ts`) that both the real
     store actions and each tool's `dryRun` path call — one implementation,
     not two.
  3. `list_templates` / `apply_template` — expose the 7 starter layouts
     (`src/constants/templates.ts`, item 7 above) directly; the guardrail
     skill previously only pointed an agent at the human gallery to look
     at, not invoke.
  4. `get_bridge_status` — answers "can read errors be a tool?" literally:
     `{connected, port, connectedSince, lastError}`, handled entirely
     server-side in `mcp-server/index.mjs` (not routed through
     `callBrowser`, so it works even with zero browser connected — that's
     the point). `lastError` is populated from three sources: the
     WebSocketServer's own `error` event (port collisions), and
     `callBrowser`'s own NOT_CONNECTED/TIMEOUT rejections.
  All mutating additions (`duplicate_component`/`group_components`/
  `ungroup_components`/`apply_template`) support the same `dryRun: true`
  pattern as Phase 4.
  Verified for real: `npx tsc -b`/`npm run lint`/`npm run build`/
  `npx vitest run` (all 75 tests) clean; `node --check mcp-server/index.mjs`
  clean. Since the real `stuidio` MCP connection was live with two active
  browser tabs during this work, verification split across two safe paths
  rather than touching that session: (a) a throwaway MCP client spawning a
  *separate* instance (which gracefully fails to bind port 5175 thanks to
  the earlier WebSocketServer fix) confirmed all 16 tools list correctly,
  and confirmed `get_bridge_status` correctly reports the port-collision
  `lastError` before any call and the `NOT_CONNECTED` `lastError` after a
  failed `get_tree` — proving it would have made the earlier real incident
  self-diagnosable; (b) a direct vitest exercise of the new pure functions,
  `TEMPLATES[].build()`, and `layoutEngine` confirmed
  `applyDuplicateComponent`/`applyGroupComponents` (including the
  same-parent-required rejection)/`applyUngroupComponents` and
  `get_layout_warnings`'s overflow detection all behave correctly — the
  exact code paths `mcpBridge.ts` calls. Updated
  `.claude/skills/stuidio-skill/SKILL.md` (tool count 9→16, new turn-loop
  steps for `get_bridge_status`/`get_layout_warnings`/`apply_template`) and
  `mcp-server/README.md`'s tool table accordingly.
- [x] **Phase 5 — conflict surfacing for concurrent human/agent edits**
  (2026-07-30): the open question from the original idea had three real
  candidate answers (last-write-wins with a visible toast, an
  optimistic-lock version counter on `get_tree`/mutations, or an "agent
  turn" mode toggle pausing human edits). Presented all three with their
  tradeoffs; user picked last-write-wins + toast — right-sized for a
  single-user local tool with no evidence yet that silent clobbering is a
  real (rather than hypothetical) problem; the other two are real,
  comparable-to-Phase-1-sized engineering (a schema change across all 9
  mutating tools, or new turn-boundary signals + UI lockout) for a
  correctness guarantee nothing has actually demonstrated a need for.
  Built: new `uiStore.agentActivity: {message, at} | null` +
  `setAgentActivity`/`clearAgentActivity` (persisted-toggle-free, purely
  transient); new `AgentActivityToast.tsx` — a small floating pill,
  auto-dismissing after 4s, mounted once in `App.tsx` alongside the rest of
  the global UI. `mcpBridge.ts` calls `notifyAgentActivity(message)` after
  every real (non-dry-run, post-`assertTreeStillValid`) commit across all 9
  mutating actions, with a per-action message using the component's real
  name/type (e.g. `Agent updated props on "Header"`, `Agent applied the
  "IDE Three-Panel" template`) — dry runs never notify, matching that they
  never touch the store either. Doesn't prevent a clobber, only makes an
  agent-driven change visible the instant it lands, which is exactly what
  was scoped.
  Verified for real: `npx tsc -b`/`npm run lint`/`npm run build`/
  `npx vitest run` (75 tests) clean. End-to-end round-trip verified against
  a live, currently-connected `stuidio` bridge tab (empty canvas, so fully
  safe): `add_component` (Spacer) → `get_tree` confirmed it landed →
  `remove_component` → `get_tree` confirmed the tab was restored to
  exactly its original empty state. This confirms the mutation pipeline
  itself round-trips correctly for real; whether the toast was visually
  seen depends on that tab's Vite dev server having hot-reloaded this
  session's new code, which wasn't independently confirmable (no way to
  see another session's screen) — a manual refresh picks it up if HMR
  didn't.

### Design gaps found via competitive analysis

Sourced from `docs/design_anal.md` (2026-07-29) — a survey of
[awesometui.com](https://awesometui.com)'s 2026 Award winners (btop,
lazygit, glow, micro, opencode) cross-referenced against published TUI
design guidance. Each gap was verified against sTUIdio's actual source
before being listed here — see `docs/design_anal.md` for the file/line
citations and the validated (already-correct) findings.

- [x] **Add an ansi256 tier to the 6 color-capable code exporters** (2026-07-30):
  `ExportColorMode` now has `truecolor`/`ansi16`/`ansi256`. Added
  `nearestAnsi256(hex)` to `shared.ts` — a real xterm-256 palette
  implementation (0-15 base colors, 16-231 as the 6x6x6 cube with levels
  `[0,95,135,175,215,255]`, 232-255 as the 24-step grayscale ramp `8 +
  10*n`), verified against the published xterm-256 spec, not guessed.
  Verified the real per-framework 256-color API before using it: Ratatui's
  `Color::Indexed(u8)` (docs.rs), lipgloss's `Color("N")` numeric-string
  form (same mechanism ansi16 already used, just a wider index range),
  Tview's `tcell.PaletteColor(0-255)` (confirmed full-range, not just 16),
  OpenTUI's `RGBA.fromIndex(0-255)` (confirmed full-range via opentui.com
  docs), Blessed's `colors.convert()` (confirmed it pass-throughs a raw JS
  `number` as an already-resolved index — required a new
  `blessedColorExpr()` emitting a bare numeric literal instead of the
  quoted-string form the other two tiers use), and Ink's `color="ansi256(N)"`
  string syntax (confirmed via Ink's actual `colorize.ts` source, not
  assumed from chalk's API alone). Textual excluded — it has no color-tier
  mode at all yet (see Deferred). Wired into `ExportPanel`'s dropdown,
  `generate-export-fixtures.mjs`, and CI's 4 verify jobs (new
  `-edge-ansi256` variant per format). Verified: 5 new/extended vitest
  assertions (all passing, including a check that Blessed emits `fg: 88`
  not `fg: "88"`), plus real toolchain checks — `cargo build`, `go test`
  (BubbleTea) + `go build`/`go vet` (Tview), `node --check` (Blessed),
  `esbuild` (OpenTUI/Ink) all clean on the new variants. Browser-verified
  live: Ratatui + ANSI-256 mode in the Export panel renders
  `Color::Indexed(7)`/`Color::Indexed(4)` for the sample tree's white/blue.
- [x] **`TextArea` component** (2026-07-30): full new-`ComponentType`
  checklist — multiline editable text input, `value`/`placeholder`/
  `width`/`height` props, real per-framework verification (not a uniform
  hand-roll): Textual's real `TextArea(text=..., placeholder=...)` with its
  real `TextArea.Changed` message; Tview's real `NewTextArea().SetText(text,
  false)`/`.SetPlaceholder()`/`.SetChangedFunc(func())`; Blessed's real
  `textarea` widget (distinct from `textbox`, genuinely multiline/
  scrollable) wired to its real `submit` event; OpenTUI's real `<textarea>`
  intrinsic — but its React-bindings prop docs explicitly say "Construct
  API not available yet", so only the confirmed `placeholder` prop is set,
  value/onChange left as a comment rather than guessed. Ratatui, BubbleTea,
  and Ink have no multiline edit widget at all (core Ratatui, this
  exporter's static BubbleTea, and no official Ink package respectively),
  so all three hand-roll a static multi-line preview with a pointer
  comment (`tui-textarea` / `bubbles/textarea` / a community package).
  Found and fixed a real bug surfaced by this component: reused `tailLines`
  (built for Log's tail-anchored "always show the newest lines" semantics)
  for TextArea's initial hand-rolled version, which pushed real content
  down with blank padding lines inserted *above* it — backwards for a
  buffer meant to be read from the top. Added `headLines` (same signature,
  pads at the bottom instead) to `constants/assets.ts` and switched every
  hand-rolled TextArea render (Canvas.tsx, the ANSI renderer, Ratatui,
  BubbleTea, Ink) to it. Verified for real: `cargo build`, `go test`/
  `go build`+`go vet`, `node --check` plus a live pty run of the new
  `blessed.textarea` widget (clean init, no runtime error), `esbuild`, and
  Textual's real headless `run_test()` mount all clean. Browser-verified
  end to end: added a TextArea from the palette, saw the placeholder
  render muted on the canvas, set a 3-line value and watched it render
  correctly with no crash in the canvas, the ANSI preview, and the
  Text/ANSI export tab, and confirmed the Textual Code tab shows the real
  `TextArea("First line\nSecond line\nThird line", placeholder=...)` with
  its `on_text_area_changed` dispatch.
- [x] **Multi-select `List` variant** (2026-07-30): opt-in `multiSelect`
  prop (default `false`) plus per-item `checked: boolean`. PropertyPanel's
  `ListItemsEditor` gained a "Multi-select" toggle and a per-item checkbox;
  Canvas.tsx and the ANSI renderer (`renderList`) both prefix `[x]`/`[ ]`
  when it's on. Verified real per-framework capability rather than
  uniformly hand-rolling: Textual has an actual native widget for exactly
  this — `SelectionList` (confirmed via textual.textualize.io), used in
  place of `ListView` when `multiSelect` is set, with its real
  `SelectedChanged` message wired the same way as the other event handlers
  (`on_selection_list_selected_changed`). The other 6 exporters have no
  native multi-select list primitive, so they hand-roll the `[x]`/`[ ]`
  prefix into each item's existing label text — Ratatui, BubbleTea,
  Blessed, OpenTUI, Ink, Tview. Extended the kitchen-sink fixture's
  existing List node (`multiSelect: true`, one item checked) rather than
  adding a new node, since it already exercised onSelect/onKeyPress and
  this combination (nav + per-item toggle + a select action) matches
  lazygit's actual UX. Verified for real: `cargo build`, `go test`/
  `go build`+`go vet`, `node --check`, `esbuild` all clean on all variants;
  Textual's real headless `run_test()` mount confirmed the generated
  `SelectionList(...)` construction and its handler dispatch. Browser-
  verified end to end: toggling Multi-select in the PropertyPanel shows
  per-item checkboxes, checking one renders `[x] • Item 1` on the canvas
  and in the ANSI preview with no crash, and the Textual Code tab shows
  the real `SelectionList(("Item 1", 0, True), ...)` reflecting the
  checked state live.
- [x] **Notification/Toast component** (2026-07-30): full new-`ComponentType`
  checklist — `message`/`variant` (info/success/warning/error) props,
  category 'display'. Deliberately scoped as a normal leaf (like Log/
  StatusBar), not a special centered-overlay type like Modal — it occupies
  wherever the user places it in the layout, keeping this proportionate to
  a single new component rather than replicating Modal's overlay-centering
  machinery across every touch point. Real per-framework check, not a
  uniform hand-roll: Textual has a genuine app-level toast —
  `self.notify(message, severity=...)` (verified via
  textual.textualize.io/api/app) — called once from `on_mount`, the one
  exporter where Toast doesn't yield a widget at all (confirmed it falls
  back to the exporter's existing empty-body `yield Static("")` handling
  when Toast is the tree's only content). Textual's real severities are
  exactly `information`/`warning`/`error` (no `success`), so the Studio's
  `success` variant maps to `information` — documented, not silently
  dropped. Also confirmed Textual always positions its own toast
  bottom-right, fixed — the Studio canvas position is a design aid only,
  not reflected in the generated position, same caveat as noted for
  BubbleTea/Ratatui's static output elsewhere in this file. The other 6
  frameworks (Ratatui, BubbleTea, Blessed, Tview, OpenTUI, Ink) have no
  notification-manager primitive at all, so all six hand-roll the same
  shared `renderToast()` helper (icon-prefixed message, in
  `constants/assets.ts`) into their existing bordered-box/Paragraph
  pattern — no per-framework variation needed there, unlike every prior P4
  component. Verified for real: `cargo build`, `go test`/`go build`+
  `go vet`, `node --check`, `esbuild` all clean; Textual's real headless
  `run_test()` mount confirmed `self.notify(...)` executes without error
  in `on_mount`. Browser-verified end to end: added a Toast from the
  palette (Display category), saw the default info variant render
  "ℹ Saved successfully" on the canvas, switched variant to Error and
  watched the icon update to "✗" live, confirmed no crash in the ANSI
  preview, and confirmed the Textual Code tab shows the real
  `self.notify("Saved successfully", severity="error")` call.
- [x] **Keybinding-convention preset in PropertyPanel** (2026-07-30):
  `KeybindingPresetEditor` in `PropertyPanel.tsx`, shown for List/Table/Tree.
  A dropdown offers fzf/lazygit/helix presets (each fills `events.onKeyPress`
  with a descriptive handler name) plus "Custom…" with a free-text fallback,
  reusing the existing (previously dead-end) `componentStore.updateEvents`
  action. Scope note: this item's own original framing assumed users could
  already hand-type `EventHandlers` somewhere — investigation found no such
  UI existed anywhere before this change, and separately that none of the 7
  exporters read `node.events` at all (flagged as its own out-of-scope
  finding, not fixed here — see the spawned task). Caught and fixed a real
  bug during implementation: switching a component already on a named
  preset (e.g. "fzf") to "Custom" initially preserved that preset's exact
  handler string, which made the reverse-lookup misread it as still being
  that preset on the next render, snapping the dropdown back instead of
  showing the free-text field — fixed by only preserving the current value
  as the custom starting point when it *doesn't* already match a known
  preset, falling back to a generic default otherwise. Browser-verified all
  transitions (None → preset → Custom → None, and preset → Custom
  specifically) round-trip correctly and persist on reselecting the
  component.
- [x] **Wire EventHandlers into the 7 code exporters** (2026-07-30, requested
  directly after the finding above): `onClick`/`onChange`/`onSelect`/
  `onKeyPress` now actually reach generated code, verified per real
  framework capability rather than uniformly faked:
  - **Textual**: real message-class dispatch (`Button.Pressed` →
    `on_button_pressed`, `Input.Changed`, `Checkbox.Changed`,
    `RadioButton.Changed`, `Switch.Changed`, `Select.Changed`,
    `ListView.Selected`, plus a generic `on_key` for List/Table/Tree's
    `onKeyPress`), each dispatching to `self.<handler>()` stub methods.
  - **Tview**: wired directly at each widget via its real callback —
    `Button.SetSelectedFunc`, `InputField/Checkbox.SetChangedFunc`,
    `DropDown/List.SetSelectedFunc`, `Box.SetInputCapture` for
    List/Table/Tree's `onKeyPress`. Every real callback signature differs
    per widget, so each adapts down to a shared no-arg `func <name>()`
    stub — necessary because `defaultEvents` reuses the same handler name
    ("handleChange") across multiple widget types with different real
    signatures, which would otherwise collide.
  - **Blessed**: real widget events — Button's `press`, Checkbox/Radio's
    `check`/`uncheck`, List's `select`, plus `keypress` for List/Table
    (Table gained `keys: true, mouse: true` so it can actually receive
    it). TextInput's `onChange` binds to `submit` (blessed's textbox has
    no clean per-keystroke change event) — noted as a semantic gap, not
    hidden.
  - **Ratatui**: the Syndrid fork adds a deterministic Tab/BackTab focus
    cursor to generated scaffolding. `onKeyPress` dispatch is now scoped to
    the focused component instead of firing globally. Rich pointer/change
    behavior still belongs in the consuming application's state machine,
    rather than being fabricated by the exporter.
  - **Ink**: `TextInput`/`Select` already used the real `ink-text-input`/
    `ink-select-input` packages with no-op `onChange`/`onSelect` props —
    wired those for real. Everything else (Button, Checkbox, Radio,
    Toggle, List, Table, Tree) is hand-rolled `<Text>`/`<Box>` with no
    click/change prop, so a one-line JSX comment notes the handler name
    instead of fabricating a call that would never fire.
  - **OpenTUI**: `<input onInput>` is a real, documented `@opentui/react`
    prop — wired. `<box>` has no documented `onClick`, and `<select>`'s
    real change events are only reachable via a ref's `.on()` (this
    exporter generates plain function components, no refs) — both left
    as comments.
  - **BubbleTea**: stays fully static (its established, deliberate
    single-render-pass constraint) — every event gets a
    `// not wired: this is a static View()...` comment, consistent with
    the existing `// consider bubbles/X` convention already used for
    Spinner/ProgressBar there.
  Extended `fixtures.ts`'s `node()` helper with an `events` parameter and
  wired real handler names onto kitchen-sink tree nodes for CI/snapshot
  coverage. Verified for real, not just via snapshots: `cargo build`
  (Ratatui), `go test`/`go build`+`go vet` (BubbleTea/Tview), `node --check`
  + a live pty run (Blessed — confirmed clean init with the new `.on()`
  bindings, no runtime error), `esbuild` (OpenTUI/Ink) all clean. Textual
  got the deepest verification: a real headless `run_test()` mount caught
  an actual bug (handler stub calls were missing the `self.` prefix,
  correct as bound methods — `NameError: name 'handleSelChange' is not
  defined` at runtime) before it was fixed; after the fix, a follow-up
  headless run additionally simulated a real keypress (`pilot.press("j")`)
  to confirm `on_key`'s dispatch to two named handlers executes cleanly.
- [x] **"New from template" starter gallery** (2026-07-30): seeds the
  canvas-creation flow with the seven recurring layout archetypes
  (Persistent Multi-Panel, Miller Columns, Drill-Down Stack, Widget
  Dashboard, IDE Three-Panel, Overlay/Popup, Header+Scrollable-List)
  instead of always starting blank. New `src/constants/templates.ts`
  exports `TEMPLATES`, each a `{id, name, description, build}` — `build()`
  returns a full `ComponentNode` tree (a `Screen` root with `id: 'root'`,
  matching the real convention several places key off of, e.g.
  `ComponentTree`'s `isRoot` check and `useComponentDrag`'s root-drag
  guard) reusing existing component types and their real default props,
  laid out to tile the 80x24 canvas via absolute positioning on top-level
  panels and flexbox flow inside each. New `TemplateGalleryModal.tsx`
  (same modal styling as `SaveDialog`/`ChangelogModal`) lists all seven
  with name + description; picking one calls `componentStore.setRoot()`
  (already undo-tracked, so no blocking confirm dialog needed — a native
  `window.confirm` was tried first but dropped since automated/headless
  contexts auto-dismiss it and it clashed with the app's styled dialogs).
  Wired into both entry points components normally use: `AppMenu`'s File
  submenu ("New from Template") and `CommandPalette` (same label, new
  `LayoutTemplate` icon). New `'templates'` `DialogName` variant.
  Verified live in-browser for all 7 templates, not just typecheck: opened
  each from both the menu and the command palette, confirmed correct tree
  structure in the Layers panel and correct canvas rendering, zero console
  errors, zero layout-engine warnings. This caught two real bugs along the
  way (fixed, not worked around): (1) the Overlay/Popup template's
  Confirm/Cancel buttons used `width: 'auto'` inside a flexbox row, which
  `flexbox.ts`'s auto-width fallback resolves to `minWidth || 10` →
  effectively near-zero width for two adjacent buttons, so their rendered
  labels overlapped — fixed by giving both buttons an explicit
  `width: 10`, matching every other leaf in these templates. (2) a
  pre-existing gap in `Canvas.tsx`'s `ComponentRenderer`: `'Modal'` had no
  case in the render-content switch, so it fell through to the `default:`
  branch which prints the raw `node.type` as literal text — every Modal
  with a border was rendering the word "Modal" inside itself. Never
  surfaced before because no prior flow built a bordered Modal with real
  children on the live canvas. Fixed by adding `case 'Modal':` to the
  `return null` group alongside `Box`/`Grid`/`Spacer`/`Screen` (Modal is a
  container — its children already render via the normal recursive path).
  `npx tsc -b`, `npm run lint`, and `npm run build` all clean after the
  fix. Preview server stopped after verification.
- [x] **Monochrome-first preview mode** (2026-07-30): a toolbar toggle
  (`Contrast` icon, next to the grid toggle) that forces the canvas
  preview to render with no designer-chosen color at all — borders,
  layout, and text stay fully visible so you can sanity-check that meaning
  survives without color, not just that the palette swapped. New
  `canvasStore.monochrome` boolean + `toggleMonochrome()`, mirroring the
  existing `showGrid`/`toggleGrid` pattern exactly. Implementation is a
  2-line change at the actual choke points: `Canvas.tsx`'s `getColor()`
  (used by every text/background/border color resolution in
  `ComponentRenderer`) returns `undefined` when monochrome is on, so every
  call site's existing `|| 'inherit'`/`|| 'hsl(var(--foreground))'`
  fallback already does the right thing with no per-component-type changes
  needed; `getColorClass()` (the separate Tailwind-class path used only by
  Checkbox/Radio's colored dot) gets the same short-circuit; and
  `buildCliGradientCss()` is gated off too so gradients don't leak through
  as color. Browser-verified: toggling on removes the StatusBar's blue
  background and the Gauge/Log's tinted borders while every box-drawing
  character, label, and position stays identical; toggling off restores
  color exactly. No new component or exporter work — this is a canvas-only
  preview aid, not an export feature.

## Skill track — `skills/tui-design-mcpmarket`

- [x] **Decide placement** (2026-07-29): went with (a) — confirmed repo-root `skills/`
  was already gitignored and never tracked (commit 6130778, before this session). Found
  and fixed a real bug in the same rule while adding the new skill below: `skills/` (no
  leading slash) matched *any* directory named `skills` anywhere in the tree, silently
  swallowing `.claude/skills/` too. Anchored to `/skills/` so only the sync target is
  ignored.
- [x] **Author a studio-specific companion skill** (2026-07-29):
  [`.claude/skills/tui-studio/SKILL.md`](.claude/skills/tui-studio/SKILL.md) — the
  12-point new-`ComponentType` checklist, a verified component→framework native-widget
  idiom map (which of the 7 exporters have a real primitive for which studio component,
  sourced from this session's P1/P4 work rather than re-guessed), the `.tui` file schema,
  and the theme/color-mode system. Generic tui-design skill covers TUI design in
  general; this one covers this codebase specifically.
- [ ] **Upstream feedback to skill content** (nice-to-have): skill's semantic-slot table
  could name the studio's 10 themes; app-patterns gallery could cite tui-studio as the
  design tool.
- [x] Telemetry awareness (no action needed): plugin phones home per session-start sync and per
  skill invocation (slug/outcome/source only, no prompt content). Acceptable; revisit if
  policy changes.

## Process / repo

- [x] Fork to `discover-dmc/tui-studio`, rewire `origin`, add `upstream` remote (2026-07-28)
- [x] Push local main + todo/audit to fork (2026-07-28)
- [x] **Triage remaining upstream PRs** (2026-07-29): confirmed we only have read access to
  upstream (`push: false` via `gh api repos/jalonsogo/tui-studio` — permissions object).
  #8–#11 (Demwunz's staged Ratatui fidelity chain: baseline → layout → input-widget →
  nav/data) fully superseded by jalonsogo's own #20, already adopted (commit c9403f4) —
  nothing to backport; can't close them ourselves, that's upstream's call. #16 (tembo-bot:
  gitignore `tsconfig.tsbuildinfo` + package-lock peer-flag cleanup) fully moot — verified
  our current `package-lock.json` already has zero `"peer": true` entries (stale-npm-version
  lockfile artifact, not a real fix to port) and the gitignore half was already done directly
  in P3. #19/#20 (jalonsogo's own) already adopted 2026-07-28; remain open upstream since we
  can't merge there.
- [x] **Decide contribution posture** (2026-07-29): land on fork, no new upstream PRs for
  now. Evidence, not assumption: upstream's last push was 2026-06-10 (opening #19/#20), last
  actual merge 2026-04-07 — even the maintainer's own PRs sit with 0–1 comments and no merge
  after 7 weeks; 11 open issues, no recent activity. A dormant maintainer sitting on their
  own unreviewed PRs won't review ours either. Revisit if jalonsogo shows renewed activity
  (merges #19/#20, comments, pushes). Tradeoff accepted: forgoes upstream credit/visibility
  for the P0/P1 exporter rewrites, but that cost is low given nothing is being merged there
  regardless.
- [x] CI on fork (2026-07-28, commit e36c799): `.github/workflows/ci.yml` runs
  lint + test + build on push/PR, Node 22. First run green: https://github.com/discover-dmc/tui-studio/actions/runs/30374434316
- [x] CI compile-checks generated output for real (2026-07-28, commit 3504160):
  `scripts/generate-export-fixtures.mjs` bundles the exporters and writes the
  kitchen-sink fixture's output for all 6 formats; `build` uploads it as an artifact;
  4 new jobs each hand it to a real toolchain — `verify-rust` (cargo build vs real
  ratatui), `verify-go` (go test calling model{}.View() vs real bubbletea+lipgloss),
  `verify-python` (py_compile + headless run_test() vs real textual),
  `verify-node-exports` (node --check on Blessed — the exact check that would've
  caught the `const screen` collision — plus esbuild syntax checks on OpenTUI/Ink
  TSX). All reproduced locally first (installed rust via brew for this); ratatui.rs
  had never actually been rustc-verified before — it compiles cleanly. First full
  run green: https://github.com/discover-dmc/tui-studio/actions/runs/30375505811
  Extended 2026-07-28 (commit d526a02) to cover 3 fixture variants per format
  (kitchen-sink, style-edge-cases, ansi16) — 19 generated files total, all reproduced
  locally before the workflow change. This is what caught the Ratatui/Textual bugs
  above for real, not just via snapshot string-matching.
