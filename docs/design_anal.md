# Design analysis: what the best TUIs do that sTUIdio doesn't (yet)

Prompted by a survey of [awesometui.com](https://awesometui.com) (a catalog of
618 open-source TUI tools built on [rothgar/awesome-tuis](https://github.com/rothgar/awesome-tuis),
including its [2026 Awards](https://awesometui.com) winners: **btop** (overall),
**lazygit** (runner-up), **glow** (best terminal UX), **micro** (best daily
driver), **opencode** (best dev tool), **bluetui** (best new discovery)),
cross-referenced against published TUI design guidance ([Charm's lipgloss/glamour
docs](https://github.com/charmbracelet/lipgloss), [Hyperbliss's "Terminal
Renaissance"](https://hyperbliss.tech/blog/2026.04.04_terminal-renaissance/),
and [gfargo/tui-design-skill](https://github.com/gfargo/tui-design-skill), a
Claude Skill that codifies these patterns for LLM-assisted TUI building) and
verified against sTUIdio's actual source, not guessed. Findings below are
either **validated** (sTUIdio already does this, confirmed) or **gaps**
(real, checked absences — sized as candidate wishlist items, not yet built).

## What the award winners actually do

- **btop** (overall winner): high-fidelity graphs/gauges built from Unicode
  blocks, in-app config with cycling layout **presets**, and dense info
  without clutter — proving a terminal dashboard can look expensive without
  a GUI.
- **lazygit** (runner-up): the reference implementation of "everything
  visible, nothing modal" — persistent multi-panel layout, single-key
  commands, and a bottom bar that shows the *current view's* keybindings,
  not a static global list.
- **glow** (best terminal UX): proves typography and visual hierarchy
  (headers, emphasis, code blocks) translate to the terminal, not just flat
  monospace text.
- **micro** / **opencode**: reliability and "no modal-editing tax" — discoverable
  keybindings over vim-style mode-switching, non-negotiable for daily-driver tools.

Common thread across all of them: **spatial consistency** (panels stay put;
the user's spatial memory becomes the navigation system) and **progressive
disclosure** (a footer hint → a `?` overlay → full docs, never all three
crammed into one screen at once).

## Validated: sTUIdio already matches best practice here

- **StatusBar's design rationale is exactly lazygit's pattern.** P4's StatusBar
  component (contextual keybinding footer) mirrors the exact mechanism
  lazygit is praised for — confirmed independently by this research, not
  just an internal design choice.
- **Exported program boilerplate already follows the "non-negotiables"** a
  TUI is expected to have (alt-screen, panic-safe restore, resize handling)
  — via each framework's own real API, not manual scaffolding sTUIdio would
  need to bolt on:
  - Ratatui: `ratatui::init()`/`ratatui::restore()` (real helper, panics
    still restore the terminal — [ratatui.rs](https://ratatui.rs) confirms
    `init()` installs its own panic hook).
  - BubbleTea: `tea.WithAltScreen()` already used in every generated `main()`.
  - Tview: `Application.Run()` owns its own resize/signal handling internally.
  - Blessed: generated code already binds `escape`/`q`/`C-c` to a clean exit.
  This is a real confirmation, not an assumption — worth knowing so nobody
  "fixes" boilerplate that already matches the reference implementations.
- **Ten curated ANSI palettes** (`src/stores/themeStore.ts`) already cover
  the exact aesthetic lineage (Dracula, Nord, Gruvbox, Tokyo Night, Solarized)
  that the top-rated tools' own themes draw from.

## Gaps: real, checked absences

Each of these was verified against the actual source before being listed —
see the file/line cited. None are guesses.

1. **Code-export color tiers stop at 2, not 3.** The standalone Text/ANSI
   export path genuinely supports a 3-tier model — `ansi16` / `ansi256` /
   `trueColor` (`src/utils/rendering/ansi.ts:90`, wired into the Export
   panel's Text tab). But the 7 framework *code* exporters only expose
   `ExportColorMode = 'truecolor' | 'ansi16'` (`src/utils/export/exporters/shared.ts:10`)
   — no 256-color tier for generated Rust/Go/Python/TS. Top TUI guidance
   (Hyperbliss) explicitly recommends designing in layered tiers
   (mono → 16 → 256 → true); sTUIdio has the top and bottom tiers wired for
   code export but not the middle one.
2. **No multiline text input.** `TextInput`'s own description says
   "Single-line text input" (`src/constants/components.ts`) — there's no
   `TextArea`/multiline editable component, needed for anything like a
   commit-message box or a chat compose field.
3. **List is single-select only.** `List`'s `defaultProps` has a single
   `selectedIndex`, no per-item checked state (`src/constants/components.ts`)
   — no built-in pattern for lazygit-style multi-select (e.g. staging
   several files at once).
4. **No transient notification/toast component.** sTUIdio has `Modal`
   (blocking/persistent) but nothing for a non-blocking, self-dismissing
   status message — the async-feedback pattern top TUIs use so the UI never
   has to freeze or force a modal dismissal just to report "saved" or
   "connection lost."
5. **No keybinding-convention preset.** `EventHandlers` is a fully free-form
   `[key: string]: string` map (`src/types/components.ts:146`) — nothing
   nudges a user designing a Table/List/Tree toward the near-universal
   `j`/`k`/`/`/`?`/`Esc` vocabulary that fzf, lazygit, and helix all share.
   Not a new component — a PropertyPanel affordance (a "keybinding preset"
   dropdown for nav-capable components).
6. **No starter-template gallery.** The canvas always starts from a blank
   `Screen`. The research above names seven recurring layout archetypes
   (Persistent Multi-Panel, Miller Columns, Drill-Down Stack, Widget
   Dashboard, IDE Three-Panel, Overlay/Popup, Header+Scrollable-List) that
   cover the large majority of real TUIs, including every award winner
   above. A "New from template" picker seeded with these would give new
   users the same starting scaffolds power users already recognize.
7. **No monochrome-first preview.** sTUIdio's `colorMode` toggle exists but
   always previews with color active by default; there's no explicit
   "preview with no color" mode to sanity-check that layout and semantics
   (not just palette) survive when color isn't available — an accessibility
   check the research calls out directly.

## Recommendation

None of these are P0/P1-severity — sTUIdio's actual editing and export
pipeline is solid and, per the validated section above, already matches
reference-implementation behavior in the places that matter most (footer
keybindings, terminal-safety boilerplate). Items 1–7 have been added to
`todo.md`'s Wishlist section as sized, sourced candidates rather than acted
on immediately — each cites the exact gap so a future session can pick one
up without re-deriving this research.

## Sources

- [awesometui.com](https://awesometui.com) — app catalog + 2026 Awards
- [rothgar/awesome-tuis](https://github.com/rothgar/awesome-tuis) — the curated list awesometui.com is built on
- [charmbracelet/lipgloss](https://github.com/charmbracelet/lipgloss) — styled-terminal design principles
- [Hyperbliss — "The Terminal Renaissance"](https://hyperbliss.tech/blog/2026.04.04_terminal-renaissance/) — seven layout patterns, color-tier model, AI-assisted TUI dev gap
- [gfargo/tui-design-skill](https://github.com/gfargo/tui-design-skill) — Claude Skill codifying these patterns, referenced again in the AI-integration wishlist item in `todo.md`
