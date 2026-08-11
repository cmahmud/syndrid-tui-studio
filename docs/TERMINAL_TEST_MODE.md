# Terminal Test Mode

Syndrid TUI Studio can run the current `.tui` v3 design through a real native terminal path before production implementation.

`Studio .tui v3 -> resolved viewport/state/scenario -> syndrid-terminal-test/v1 -> Ratatui + TachyonFX -> native PTY/ConPTY -> xterm VT emulator`

The bundled `syndrid-tui-preview` sidecar renders real Ratatui widgets and compiles authored TachyonFX DSL at runtime. Built-in deterministic scenarios cover Default, Empty, Loading, Loaded, Error, Offline, Slow Network, Large Dataset, and Unicode/Emoji. Custom fake-data/timeline scenarios persist in `.tui` v3 without mutating the authored tree.

Controls include viewport, scenario, 0.25x-4x speed, reduced motion, loop, start position, fake data, hot reload, keyboard input and a debug overlay. Tab/Shift+Tab navigate focus, arrows navigate supported selection widgets, Enter activates controls, Ctrl+P pauses, Ctrl+R replays, Ctrl++/Ctrl+- adjust speed and Ctrl+Q exits.

Test Mode shares the canonical motion and responsive resolvers used by save, MCP, motion export and implementation-spec generation. Hidden responsive nodes consume no layout space and all rectangles passed to Ratatui are integer terminal cells.
