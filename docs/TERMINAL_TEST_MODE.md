# Terminal Test Mode

Syndrid TUI Studio can execute the current `.tui` v3 design through a real native terminal path before production implementation.

`Studio .tui v3 -> canonical responsive/state/scenario resolver -> syndrid-terminal-test/v1 -> Ratatui + TachyonFX -> native PTY/ConPTY -> xterm VT emulator`

The bundled `syndrid-tui-preview` console sidecar renders actual Ratatui widgets and compiles authored TachyonFX DSL at runtime. Built-in deterministic scenarios cover Default, Empty, Loading, Loaded, Error, Offline, Slow Network, Large Dataset, and Unicode/Emoji. Custom variables and timeline scenarios persist in `.tui` v3 without mutating the authored component tree.

Controls include viewport, scenario, 0.25x-4x speed, reduced motion, loop, start position, deterministic fake data, hot reload, keyboard input, replay/pause, and a debug overlay. The runtime shares the same canonical responsive and authored-motion resolvers used by save, MCP, production motion export, and implementation-spec generation.

Hidden responsive nodes consume no layout space. Geometry passed to Ratatui is quantized to integer terminal cells. The Studio surface uses xterm.js so cursor movement, alternate-screen redraws, colors, and fullscreen animation frames are interpreted as terminal control sequences rather than flattened HTML.
