# Glossary

- **Table text:** Warm white (`onTable`) or pale green (`onTableMuted`) text on the green playing surface. Card faces and light buttons keep dark ink and red/black suits.

- **Landscape board:** Game layout adapted to a wider, shorter screen. Pyramid places stock beside its rows; Clock sizes its full circle to available height. Rotation preserves the deal and history.

- **Deal:** Original and current card layouts plus game rules. New creates a fresh deal; Restart restores its original layout. Legacy saves without an original layout restart from their saved position.
- **Pending defaults:** Settings used when creating the next deal. Changing them does not alter an active deal.
- **Resume:** Restore the latest in-progress deal for a variant, including its original layout and up to 50 Undo/Redo positions.
- **Snapshot:** Manually saved deal and history selected through debug Save/Load controls.
- **Run:** Selected card and the movable cards stacked below it. Moving a run preserves its selected starting card.
- **Offload:** Explicit, stoppable automation that moves safe cards into foundations, one move about every 0.1 seconds.
- **Safe foundation move:** Legal promotion that preserves tableau support for lower cards under the deal's build policy.
- **Save conflict:** Another tab changed the same saved game. Local changes are blocked from overwriting it; Load latest saves returns home and discards unsaved changes in this tab.
- **Offline copy:** Complete, verified app files cached on the device for use without a network. Ready offline describes these files; saved game data is stored separately.
- **Home Screen app:** The app opened from its installed iPad icon. It can use separate storage from Safari, so it needs its own online setup and Ready offline check.
- **Game preview:** Decorative example layout on the home screen. It does not show or change a saved deal.
- **Drag move:** Explicitly move the dragged card or run to a legal destination at release. Invalid or interrupted drags do not change the deal.
- **Hint cycle:** Repeated Hint taps show successive suggestions for the same position, then wrap. Changing the board resets the cycle.
- **Move explanation:** Rule-specific feedback after an attempted action is rejected; it does not change the deal or history.
- **Repeated-tap hint:** A brief visual suggestion after tapping the same wrong spot twice within 1.5 seconds. It marks a legal source/destination without moving cards; Reduce Motion keeps the highlight steady.
- **Failed-move log:** Latest 200 rejected attempts saved separately from game progress, with visible-board context, active rules, attempted action, and rejection reason. Exportable as JSONL for training.
