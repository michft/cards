# Changelog

## Unreleased

### Fixed

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
