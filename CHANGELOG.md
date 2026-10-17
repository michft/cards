# Changelog

## Unreleased

### Fixed

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
