# Mum's Cards - Cross-Game Rules

These rules should apply to every game module (`Klondike`, `Spider`, `FreeCell`, and future games).

## Interaction
- Support `Undo` and `Redo`.
- Allow deselect by tapping the same selected source again.
- Support press-and-hold tableau expand/collapse to reveal suits/ranks clearly.
- Keep card movement explicit and user-driven unless an automation action is explicitly invoked.

## Automation
- Provide an `Offload` button for automatic safe foundation moves.
- Offload should animate visibly at about `0.1s` per move.
- Offload should be stoppable (`Offload` / `Stop`) and disabled when no move exists.

## Navigation
- Use the floating `Games ▾` dropdown in all game screens.
- Keep game entries alphabetical in dropdowns.
- Keep `< home` as the final dropdown item.

## Persistence
- Persist one resumable in-progress game per variant.
- Support manual Save/Load snapshots per game.

## Settings
- Route each game to its own settings context (e.g. `?game=klondike`, `?game=spider`, `?game=freecell`).
- Keep settings labels and controls specific to the active game.
- Rule toggles apply to newly created deals. Active and resumed games retain their stored rules.
- Legacy saves without rule metadata use the original defaults: any empty Klondike column, alternating red/black FreeCell builds.
- Wait for persisted settings and saves before initializing a game screen.

## Web keyboard shortcuts
- Handle shortcuts only while the game screen is focused; Settings and Rules must not modify a hidden game.
- Leave shortcuts in inputs, textareas, selects, and editable content to the browser.
- Support Cmd/Ctrl+Z (Undo), Cmd/Ctrl+Shift+Z (Redo), Cmd/Ctrl+N (New), Cmd/Ctrl+R (Restart), and Cmd/Ctrl+A (Offload where available).
- Preserve Klondike's existing unmodified U/R/H/D/N shortcuts while its screen is focused.

## Validation
- Run `pnpm typecheck` and `pnpm test` for engine, persistence, and interaction regressions.
- For web verification, install the Playwright browser with `pnpm exec playwright install chromium --only-shell`, build with `pnpm web:build`, then run `pnpm test:e2e:web`.

## UX Baseline
- Show a clear win state message in each game screen.
- Keep visual/action layout conventions consistent across games where practical.
