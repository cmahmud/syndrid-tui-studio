# Deep Analysis 1 — tui-studio + tui-design skill

Date: 2026-07-28. Scope: full repo audit (`src/`, build/lint, exporters exercised with a real
component tree via esbuild-bundled `codeExporter.ts`) plus the vendored
`skills/tui-design-mcpmarket` plugin. Method: source read + concrete output generation, not
just inspection.

## 1. Repo health snapshot

| Check | Result |
|---|---|
| `npm run build` | Passes (tsc + vite, 1.4s) |
| `npm run lint` | **Fails** — 1 error: empty `RatatuiExportSettings` interface in [export.ts:56](../src/types/export.ts) (introduced by the ratatui fix, PR #15) |
| Bundle | Single 970 KB chunk (266 KB gzip), no code-splitting |
| Tests | None configured |
| Uncommitted | `package.json` drops unused `react-router-dom` (good removal, not committed); `skills/` untracked |

## 2. Export subsystem — the core finding

Seven advertised targets, wildly uneven quality. Verified by running each exporter against a
tree of Screen → Header(Text) / Body(List, ProgressBar, Table, Button, TextInput) / Box.

| Target | Verdict | Detail |
|---|---|---|
| Text / ANSI / HTML | ✅ Solid | Real renderer pipeline; `ansiToHtml` handles 16/256/truecolor + SGR attrs, escapes `&<>` |
| Ratatui (Rust) | ✅ Good | Own module ([ratatui.ts](../src/utils/export/exporters/ratatui.ts)); full widget coverage, style translation, proper escaping, layout constraints |
| Ink (React) | 🟡 Mostly good | Full widget coverage + styles. Bug: border color uses `node.style.color` (text color) instead of `node.style.borderColor` ([codeExporter.ts:278](../src/utils/export/codeExporter.ts:278)) |
| OpenTUI | 🔴 Broken | **Drops all text content** — `Text`/`Button` emit self-closing tags with no content/label. Only 4 type mappings; List/Table/ProgressBar all degrade to empty `<Box />` |
| Textual (Python) | 🔴 Broken | Generated file does not parse. See below |
| BubbleTea (Go) | 🔴 Broken | `generateBubbleTeaView` never recurses — the entire tree becomes one `return "Component: Screen"` line |
| Blessed (Node) | 🔴 Broken | Generates `const screen = blessed.box(...)` for the Screen node, **redeclaring the `screen` variable** → SyntaxError on every export. Duplicate node names also collide. Flat `screen.append()` for all nodes, no nesting, no colors |
| Tview (Go) | ⚫ Nonexistent | Advertised in README/CLAUDE.md and typed as `'tview-go'` in `ExportFormatId`, but no implementation and no dropdown entry. `exportToCode(root, 'tview')` returns `// Unsupported export format` |

### 2.1 Textual, specifically (verified output)

```python
class MyApp(App):
    def compose(self) -> ComposeResult:
    yield Static("Dashboard")            # IndentationError: same level as def
    ...
    yield Input(placeholder="type "here"...")   # unescaped quotes → SyntaxError
```

Four independent defects in [codeExporter.ts:439-466](../src/utils/export/codeExporter.ts:439):

1. **Indentation**: `generateTextualComponents(root, 2)` emits 4-space indent, same as the
   `def compose` line — body must be at 8. Every non-trivial export is unrunnable.
2. **No escaping**: `props.content`/`label`/`placeholder` interpolated raw into
   double-quoted Python strings. Any quote in user content breaks the file.
3. **Structure discarded**: only `Text`, `Button`, `TextInput` mapped. Containers vanish
   (children flattened), everything else becomes `yield Static("<TypeName>")`. No
   `Vertical`/`Horizontal` containers, which Textual has and which map 1:1 to the studio's
   flexbox model.
4. **No style translation**: colors/borders/bold ignored entirely.
   `TextualExportSettings.includeCSS` exists in the types but nothing implements TCSS output.

Same raw-interpolation bug exists in the BubbleTea and Textual exporters; Ink, Ratatui, and
Blessed escape correctly (`escJsx`, `escRust`, `JSON.stringify`).

A background task chip (`task_5f523ab8`) was already spawned in a prior session to rebuild
the Textual exporter to Ratatui's standard.

### 2.2 Export type system is disconnected from reality

- `ExportFormatId` declares `'ink-react' | 'textual-python' | 'tview-go' | ...` but the
  runtime uses `'ink'`, `'textual'`, etc. Nothing ever type-checks: `ExportPanel.tsx:9`
  does `type CodeFormat = any` with a comment admitting the workaround.
- `ExportSettings` and all six framework-settings interfaces
  (`InkExportSettings`, `TextualExportSettings`, …) are dead code — the panel keeps two
  `useState` strings and none of the settings (indent, color mode, comments) exist in the UI.
- `html` is a real dropdown option but absent from `ExportFormatId`; `tview-go` is the
  reverse. The one lint error lives in this same file. The whole of
  [types/export.ts](../src/types/export.ts) describes an export system that was planned but
  never built.

## 3. Other repo findings

- **Editor core is healthy.** Layout engine (flexbox/grid/absolute, 626-line orchestrator),
  ANSI rendering, componentStore with history, 20-type component library, 10 accurate theme
  palettes ([themeStore.ts](../src/stores/themeStore.ts) — Tokyo Night etc. match upstream
  hex values). One TODO: flexbox `stretch` sizing unimplemented
  ([flexbox.ts:216](../src/utils/layout/flexbox.ts:216)).
- **`docs/` is stale.** The five `TUI_DESIGNER_*` files are pre-implementation planning
  (16-week roadmap) that no longer reflects the codebase. Trust README + source.
- **`wailsjs/` is dead.** No import of it anywhere in `src/`; leftover from an abandoned
  Wails desktop wrapper. Deletable.
- **Version drift.** `package.json` says `0.0.1`; CHANGELOG/About modal say v0.3.6 (version
  injected from git tag at build).
- **XSS check: clean.** The two `dangerouslySetInnerHTML` uses render `ansiToHtml` output,
  which HTML-escapes `&<>` before emitting spans.
- **`skills/` is untracked and not gitignored.** It is sync-owned by the MCPmarket plugin
  (its `sync.sh` overwrites it); committing it would vendor third-party generated content.
  Either gitignore it or commit deliberately knowing sync will rewrite it. No secrets inside
  (this copy has no `.mcp.json`).
- **`.claude/launch.json` is absent** despite a prior-session handoff claiming it was added;
  only `settings.local.json` exists. Dev server must be started manually
  (`npm run dev` → localhost:5173).
- Misc: single 970 KB JS chunk (vite warns); `playwright` devDep serves only
  `scripts/screenshot.mjs`; browserslist data 6 months old.

## 4. The tui-design skill (`skills/tui-design-mcpmarket`)

### 4.1 Content quality: high

435-line `SKILL.md` + two references (`visual-catalog.md` 278 lines, `app-patterns.md` 219
lines). Framework-agnostic and technically accurate: layout paradigm selector (Miller
columns, multi-panel, drill-down…), color-tier degradation (16/256/truecolor with correct
escape sequences and `$COLORTERM`/`$NO_COLOR` detection), semantic color slots, keybinding
lingua franca, flicker-free rendering stack (double buffer + sync output + batched writes),
ranked anti-pattern checklist. The example hex palette in its semantic-slot table is
literally Tokyo Night — the same palette in the studio's `themeStore`. Genuinely useful as a
design companion to the studio.

### 4.2 Placement: the repo copy is inert

Claude Code discovers project skills from `.claude/skills/`, not a repo-root `skills/`
directory. The active `tui-design` skill in sessions comes from the *installed* MCPmarket
plugin (`mcpmarket-me:tui-design`), not from this folder. The vendored copy — including its
`hooks/hooks.json`, `hook-shim.sh`, and `shared/*.sh` — does nothing from this location;
plugin hooks only execute from the plugin install path.

### 4.3 Plugin mechanics + telemetry (from the installed plugin, mirrored here)

- `SessionStart` hook runs `sync.sh`: pulls the skill baseline from `app.mcpmarket.com`
  (Bearer token read from the plugin's `.mcp.json`), writes skills to disk, TTL sentinel to
  avoid re-sync (the "cached (158s remaining)" session message).
- `PostToolUse`/`PostToolUseFailure` on `Skill` invocations fire a telemetry POST:
  skill slug, source (`user`|`agent`), outcome, error class. Prompt text is parsed locally
  and never transmitted — only the source bit.
- Engineering is defensive and well-commented: API host allowlist (`*.mcpmarket.com`,
  localhost for dev), slug regex validation both client- and server-mirrored, `\x1F` field
  separators to prevent field-smuggling, silent failure everywhere.
- Privacy posture: acceptable — usage telemetry only, no content exfiltration observed in
  either script. The dependency is that every session start can hit the network and every
  skill invocation phones home.

### 4.4 Skill vs. studio: the gap

The skill preaches what the exporters don't practice: "never hardcode hex — reference
semantic slots" (exporters emit raw hex), graceful 16-color degradation (only the text/ANSI
exporter does tiers; code exporters emit truecolor-or-nothing), container-based responsive
layouts (Textual/Blessed exporters flatten structure). If the studio's export story is
rebuilt, the skill's semantic-slot + tier model is a ready-made spec.

## 5. Ranked recommendations

1. **Fix or gate the broken exporters.** Textual (task_5f523ab8), BubbleTea, Blessed, and
   OpenTUI all ship unrunnable or lossy code. Cheapest honest fix: hide them from the
   dropdown until each reaches Ratatui/Ink parity; a broken export is worse than none.
2. **Fix the Ink borderColor bug** (one line, `style.borderColor` not `style.color`).
3. **Reconcile `types/export.ts` with reality** — align `ExportFormatId` to the actual
   strings, add `html`, drop `tview-go` (or implement Tview), delete the six dead settings
   interfaces. This also clears the lint failure.
4. **Decide `skills/` fate**: gitignore it (it's plugin-sync output) or move a curated copy
   to `.claude/skills/` if project-local discovery is actually wanted.
5. Housekeeping: delete `wailsjs/`, archive or delete stale `docs/TUI_DESIGNER_*`, sync
   `package.json` version, add `.claude/launch.json` if one-command preview is wanted.
