# Desktop and Agent-Bridge Security

- Tauri uses explicit production/development CSPs.
- The MCP browser bridge binds only to `127.0.0.1:5175` and requires a random per-user token plus an allowed local origin.
- Bridge tokens are never stored in `.tui` files, MCP responses or source control.
- Native preview specs are validated before the bundled sidecar launches and temporary spec files are removed with the PTY lifecycle.
- PTY output is bounded and local image preview enforces supported extensions and a size limit.
- Terminal commands start only from explicit user Run/Test actions, never ordinary Canvas rendering.
