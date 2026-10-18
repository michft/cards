# Changelog

## Unreleased

### Added

- Explain rejected moves across all five games, with rule-specific feedback for tap/drag attempts.
- Keep up to 200 failed attempts locally with visible-board context, active rules, reasons, Retry, and JSONL training export from Settings.
- Redesign the home screen with illustrated game layouts, a responsive game grid, and a distinct Continue tile.
- Drag cards and runs in FreeCell, Spider, Clock, and Pyramid; release on legal destinations and cancel interrupted gestures.
- Cycle Spider hints with repeated taps, including legal stock deals; reset hints after changing the board.
- Installable iPad web app with a verified, versioned offline copy of all five games, Rules, Settings, and local saves.
- Offline readiness/retry status, safe waiting updates, deployable ZIP packaging, and iPad setup instructions in `docs/ipad-offline.md`.

### Fixed

- Announce Rules/Settings loading politely, explain missing ZIP tooling, and return an offline home page or HTTP 503 when a cached file and network are unavailable.
- Give gameplay, menu, and snapshot controls 44-pixel minimum touch targets and reserve space below the floating Games menu.
- Give Spider's settings button the same accessible label as the other games.
- Hydrate query-dependent Rules and Settings content after mounting to match static HTML.
- Validate saved cards, variant layouts, rules, and history before mounting; ignore malformed positions without crashing.
- Recover legacy Clock chains with active Kings and migrate original flat-stock layouts without losing cards; reject ambiguous origins.
- Fix inherited-key Rules routes and explain Clock King returns and FreeCell auxiliary columns correctly.
- Show failed writes with Retry, serialize pending saves, and protect other tabs' progress with locked read/merge and stale-game conflict checks.
- Use final drag-release coordinates instead of the previously highlighted destination.
- Use Cmd/Ctrl+Alt+N for New so Cmd/Ctrl+N remains available to the browser.
- Correct Klondike completion eligibility and remove Spider's arbitrary 12-card move cap.
- Replace New game URLs with resumable URLs after saving; Games menus resume progress and home exits replace the game screen.
- Preserve original deals and up to 50 Undo/Redo positions across Resume and Snapshot Load. Legacy saves restart from their saved position.
- Block writes after storage read failures and offer Retry instead of overwriting unread saves.
- Count auxiliary empty columns in FreeCell multi-card move limits, excluding an empty destination.
- Skip reversible Klondike hint shuffles and redundant FreeCell column relocations; prioritize FreeCell foundation hints.
- Switch FreeCell and Spider selection when tapping another movable source; reject immovable FreeCell sources.
- Clear selection during Offload, remove Klondike's plain N shortcut, and preserve Redo after an empty Draw.
- Keep drag responders mounted until card movement finishes.
- Allow Clock chains to start from an unreturned stock King.
- Preserve active deals when default settings change; retain Klondike/FreeCell rules with saves and snapshots.
- Wait for stored settings and saves before opening a game; preserve progress across Resume.
- Limit web keyboard shortcuts to the focused game screen and leave text editing commands alone.
- Restrict Offload to safe foundation moves, and stop it when loading a Klondike snapshot.
- Keep manual Klondike moves explicit, including the exact selected run.
- Exclude redundant whole-pile moves between empty columns from Klondike hints.
- Hydrate before mutations; recover from malformed settings and failed storage reads.
- Update web regression checks for current menu labels and game interactions.
