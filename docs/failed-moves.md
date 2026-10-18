# Move explanations and training logs

Rejected moves show the relevant rule in a floating notice without shifting the board. Dismiss the explanation or make a legal move to clear it. Tap and drag controls keep the deal and Undo/Redo history unchanged after rejection. Normal selection changes, deselection, successful moves, hints, and interrupted gestures do not count as failed moves.

Tap the same wrong spot again within **1.5 seconds** to see a legal move: its source and destination pulse twice for **2.2 seconds**, with a written suggestion. The app prefers a move for the attempted card when possible, then another legal move or stock action. Nothing moves automatically. Reduce Motion shows a steady highlight. Changing the board, selection, route, or dismissing the notice clears the suggestion. When no suggestion exists, the notice says so. Every rejected attempt still logs separately; Pyramid's normal deselection after an invalid pair can request help without adding a failed-move record.

The log keeps the latest **200 failed attempts**, including pending entries, on this device. It is stored separately from saved games and works offline. Settings → **Failed moves and training** shows saved/pending counts, Retry, **Export training log**, and **Clear failed-move log**. Clearing this log leaves game progress intact. If logging fails, the explanation stays available and the failed write is shown; keep the page open and retry to preserve pending entries.

Export downloads `mumscards-failed-moves.jsonl` on web/iPad Home Screen. Native builds open the platform share sheet with JSONL text. Export is user-triggered; the app never uploads logs automatically. Use exported JSONL in your own analysis or training process.

Each line is an independent JSON record:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` for this format. |
| `id`, `occurredAt` | Attempt identifier and ISO timestamp. |
| `game` | Clock, FreeCell, Klondike, Pyramid, or Spider variant ID. |
| `interaction` | `press` (tap/click/button activation) or `drag`. |
| `position` | Visible board and the deal's rules immediately before rejection. |
| `attempt` | Action kind and source/destination zones with zero-based indexes; a drop outside a target has `destination: null`. |
| `rejection.code` | Rule label; combine with `game` when grouping failures. |
| `rejection.message` | Explanation shown to the player. |

Stock identities are replaced by counts. Face-down cards contain only `faceUp: false`; card IDs are omitted. Clock logs the active card, known placed cards, and hidden-pile counts. An invalid source selection uses `attempt.kind: "select"`, which can be separated from destination attempts during training.

Pending entries remain exportable after a write failure when existing logs can still be read. An unreadable existing log is never overwritten automatically. Retention is bounded, so export before exceeding 200 attempts if all examples are needed.
