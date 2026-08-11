# Desktop and Agent-Bridge Security

- Tauri uses explicit production and development content-security policies.
- The Studio MCP browser bridge binds only to `127.0.0.1`.
- A random per-user bridge token is stored outside `.tui` project files and attached by the desktop client.
- The MCP preload validates the token with a timing-safe comparison and rejects untrusted WebSocket origins.
- Secrets and bridge tokens are never serialized into portable design files.
- PTY sessions and temporary preview specs are removed when the child exits or the Studio session is stopped.
