# Keybinding conventions

`EventHandlers` (the `events` field on any `ComponentNode`) is a fully
free-form `{ [key: string]: string }` map — nothing stops you from making
up an arbitrary handler name. Don't. For any `List`/`Table`/`Tree` that
needs keyboard navigation, set `onKeyPress` to one of these three
near-universal conventions instead — the same three already offered as a
one-click preset in the human PropertyPanel UI
(`src/components/properties/PropertyPanel.tsx`'s `KEYBINDING_PRESETS`):

| Convention | `onKeyPress` value | What it implies |
| --- | --- | --- |
| fzf-style | `handleFzfKeys` | `j`/`k` to move, `/` to filter, `Esc` to close |
| lazygit-style | `handleLazygitKeys` | Arrow keys + single-key actions, `?` opens help |
| helix-style | `handleHelixKeys` | Multi-key sequences, space as leader key |

These only set the handler *name* — actual behavior is generated per
export target, same as any other event handler. The point is picking a
name a human (or another tool) will recognize instead of an arbitrary one
like `handleKeys` or `onNav`.

If none of the three fit, leave `onKeyPress` unset rather than inventing a
fourth convention.
