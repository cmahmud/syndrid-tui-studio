<img src="public/logo-tui-studio_light.svg" alt="Syndrid TUI Studio" width="64" />

# Syndrid TUI Studio

**Visual design tool for building Terminal User Interfaces**

> **Syndrid TUI Studio fork** — This working tree extends sTUIdio with Ratatui-first responsive breakpoints, terminal-cell-correct Unicode measurement, prototype/focus states, a visual motion editor, TachyonFX-oriented motion export, reusable design-system components/tokens, a portable `syndrid-tui-spec/v1` agent artifact, and a project-local Codex/MCP bridge. Upstream remains credited and the MIT license is preserved.

### Syndrid workflow additions

- **Responsive matrix** — committed Wide 160×48, Medium 120×36, Narrow 80×24 and Short 100×18 previews, plus custom viewports and per-breakpoint overrides.
- **Prototype + motion editor** — focus/state/keybinding metadata and replayable fade/slide/wipe/pulse/dissolve/glitch/typewriter/highlight/spring design-time previews with reduced-motion fallbacks.
- **Ratatui + motion handoff** — optional Ratatui scaffolding plus a separate TachyonFX-oriented Rust motion plan; generated code is never required to replace existing Syndrid architecture.
- **Design system** — semantic tokens and reusable component subtrees persist inside `.tui` project data.
- **Codex/MCP** — `.codex/config.toml`, `AGENTS.md`, responsive render/warning tools, prototype/motion tools and reusable-component operations let an agent work from structured design intent rather than screenshots.
- **Agent Spec export** — one JSON artifact includes the source tree, tokens, all responsive text previews, interaction metadata and motion plan for implementation in the real Syndrid repository.


![Status](https://img.shields.io/badge/status-alpha-orange)

A Figma-like visual editor for designing Terminal UI applications. Drag-and-drop components onto a live canvas, edit properties visually, and export to multiple TUI frameworks.
<img width="400" height="400" alt="Computer" src="https://github.com/user-attachments/assets/89fc6a4f-7034-49e3-9729-5355c276842f" />


## Features

- **Visual Canvas** — Drag-and-drop components with live ANSI preview at configurable zoom levels
- **27 TUI Components** — Screen, Box, Grid, Spacer, Separator, TextInput, TextArea, Button, Checkbox, Radio, Select, Toggle, Text, Spinner, ProgressBar, Gauge, Sparkline, Log, Toast, Table, List, Tree, Menu, Tabs, StatusBar, Breadcrumb, Modal
- **Layout Engine** — Absolute, Flexbox, and Grid layout modes with full property control
- **Color Themes** — Dracula, Nord, Solarized Dark/Light, Monokai, Gruvbox, Tokyo Night, Nightfox, Sonokai — all updating the canvas in real-time
- **Dark / Light Mode** — Toggle between dark and light editor UI; persists across sessions
- **Layers Panel** — Hierarchical component tree with drag-to-reorder, visibility toggle, lock, and inline rename
- **Property Panel** — Edit layout, style, and component-specific props for the selected component
- **Undo / Redo** — Full history for all tree mutations
- **Save / Load** — `.tui` JSON format via native OS file picker (Chrome/Edge) or browser download (Firefox/Safari)
- **Multi-Framework Export** — Generate code for Ink, BubbleTea, Blessed, Textual, OpenTUI, Ratatui (Rust), Tview (Go)
- **Command Palette** — `Cmd/Ctrl+P` for quick component creation, theme switching, and dark/light mode toggle
- **Gradient Backgrounds** — Add linear gradients to any element background with angle control and N color stops; rendered as discrete character-cell bands matching real ANSI terminal output
- **Settings** — Accent color presets, dark/light mode, reduced-motion preview, Codex/MCP bridge status, and default download folder


## Quick Start

### Browser development

```bash
npm ci
npm run verify:syndrid
npm run dev
```

Open `http://localhost:5173`.

### Windows desktop app

The repository includes a Tauri 2 desktop shell. On a Windows machine with the Tauri prerequisites installed:

```powershell
npm ci
npm run desktop:dev
```

Build the installable Windows NSIS executable with:

```powershell
npm run desktop:build
```

For normal public/private distribution, push a `v*` Git tag. The included GitHub Actions workflow builds the Windows x64 `-setup.exe` and attaches it to a GitHub Release automatically. See `docs/WINDOWS_DESKTOP.md`.

## Keyboard Shortcuts

| Action          | Shortcut                          |
| --------------- | --------------------------------- |
| Command Palette | `Cmd/Ctrl+P`                      |
| Save            | `Cmd/Ctrl+S`                      |
| Open            | `Cmd/Ctrl+O`                      |
| Export          | `Cmd/Ctrl+E`                      |
| Copy            | `Cmd/Ctrl+C`                      |
| Paste           | `Cmd/Ctrl+V`                      |
| Delete          | `Backspace` / `Delete`            |
| Undo            | `Cmd/Ctrl+Z`                      |
| Redo            | `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` |

**Component hotkeys** (when not typing):

| Key | Component | Key | Component   |
| --- | --------- | --- | ----------- |
| `b` | Button    | `t` | Tabs        |
| `r` | Box       | `l` | List        |
| `k` | Checkbox  | `e` | Tree        |
| `a` | Radio     | `m` | Menu        |
| `s` | Select    | `i` | TextInput   |
| `o` | Toggle    | `p` | ProgressBar |
| `n` | Spinner   | `y` | Text        |
| `j` | Spacer    |     |             |

## File Format

Projects are saved as `.tui` files (JSON). Version 2 keeps the original tree/theme and adds portable Syndrid project data; version 1 files still load.

```json
{
  "version": "2",
  "meta": { "name": "My Screen", "theme": "dracula", "savedAt": "..." },
  "tree": { "...": "component tree with optional responsive/prototype metadata" },
  "project": {
    "viewports": ["Wide", "Medium", "Narrow", "Short"],
    "designTokens": { "...": "semantic tokens" },
    "reusableComponents": []
  }
}
```

## Export Frameworks

| Framework                                               | Language           |
| ------------------------------------------------------- | ------------------ |
| [Ink](https://github.com/vadimdemedes/ink)              | TypeScript / React |
| [BubbleTea](https://github.com/charmbracelet/bubbletea) | Go                 |
| [Blessed](https://github.com/chjj/blessed)              | JavaScript         |
| [Textual](https://github.com/Textualize/textual)        | Python             |
| [OpenTUI](https://opentui.js.org/)                      | TypeScript         |
| [Ratatui](https://ratatui.rs/)                          | Rust               |
| [Tview](https://github.com/rivo/tview)                  | Go                 |

## Tech Stack

- **React 19**, TypeScript 5.8, Vite 7
- **Zustand 5** — state management
- **Tailwind CSS** — editor UI styling
- **Lucide React** — icons

## Commands

```bash
npm run dev      # Start dev server
npm run build    # TypeScript compile + production build
npm run lint     # ESLint
npm run preview        # Preview production build
npm run verify:syndrid # Verify Syndrid/Codex integration structure
npm run desktop:dev    # Run the Tauri desktop app in development mode
npm run desktop:build  # Build the Windows NSIS installer
npm run desktop:info   # Show Tauri environment/prerequisite information
```

---

## Codex integration

Start the Studio with `npm run dev`, enable **Settings → Codex / MCP Agent Bridge**, and then start Codex from the repository root. The included `.codex/config.toml` launches the local stdio MCP server. Its tool annotations pair with Codex `writes` approval mode so read-only inspection is low-friction while design-changing operations remain approval-aware. See `docs/CODEX.md`.

The top toolbar shows live **Codex** bridge status: off, waiting, or connected.

## Preview fidelity

The browser canvas is a terminal-cell-aware design renderer, including wide Unicode/emoji handling and responsive character-cell dimensions. It is intentionally **not** described as an embedded Ratatui runtime. Production parity is verified through structured Ratatui handoff/export, generated-code compile checks in CI, responsive layout diagnostics, and integration in Syndrid's real Ratatui codebase.

## License & attribution

MIT licensed. This fork preserves the repository `LICENSE` and upstream attribution. It is based on the `discover-dmc/tui-studio` / TUI Studio lineage and adds Syndrid-specific Ratatui, responsive, motion, design-system, and Codex integration work.
