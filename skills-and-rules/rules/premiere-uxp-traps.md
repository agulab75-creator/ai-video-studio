# Premiere Pro UXP API Traps

When writing custom automated scripts or orchestration logic for Adobe Premiere Pro, you MUST adhere to the following critical safety invariants.
**NOTE**: These traps apply to the **UXP** API only (`createMoveAction`, `lockedAccess`, `executeTransaction`), NOT ExtendScript/CEP.

## 1. The Reordering Corruption Bug (CRITICAL)
- **Danger**: A move that changes the chronological order of clips commits without error but permanently corrupts the project (timeline holes, drifting clips, white frames on export).
- **Why**: Premiere's internal `getTrackItems()` list stops being sorted by time, violating internal invariants. The damage is saved into the `.prproj`.
- **Safe Pattern**: Clone segments into free space in target order, delete originals without rippling, then use a collective shift (`closeGaps`) to slide back.

## 2. Stale Objects and `lockedAccess`
- **Danger**: `SequenceEditor` handles obtained outside a lock silently fail without throwing errors (`ok: true` but nothing happens). Track items throw "The script object is no longer valid."
- **Why**: Object handles go stale across asynchronous boundaries. 
- **Rule**: Acquire object handles (e.g., `SequenceEditor`, `TrackItemSelection`, `ProjectItem`) **inside** the `lockedAccess` callback.

## 3. Addressing by index (Query outside, fetch inside)
- **Danger**: `lockedAccess` takes a synchronous callback, but clip times are read asynchronously (`getStartTime()`), making it impossible to find clips by time inside the lock.
- **Why**: `getTrackItems()` is synchronous and returns an array.
- **Rule**: Outside the lock, read times and compute target indices. Inside `lockedAccess`, re-acquire `getTrackItems()` and take them by index. Re-read indices after every commit.

## 4. Transaction Atomicity
- **Danger**: If building an Action throws an error inside the `executeTransaction` callback, the actions already added stay applied.
- **Why**: `executeTransaction` does not roll back on an exception.
- **Rule**: Build every `Action` *before* opening a transaction (`executeTransaction`). Inside the transaction, do nothing but `addAction`.

## 5. Linked Video and Audio Disconnect
- **Danger**: `createSetEndAction` on a video clip honestly returns `ok` but does not touch the linked audio clip, breaking sync.
- **Why**: The link is not expressed in the API. They are independent objects.
- **Rule**: Apply the exact same trim/move actions to both linked video and audio clips in a single transaction. Detect links heuristically (same project item ID + matching start/end).

## 6. Trimming and Moving are Separate
- **Danger**: `createMoveAction(-12.33)` throws `Invalid parameter` if the clip still sits at 0, even if a previous trim in the same transaction would have made the move valid.
- **Why**: Actions are validated at build time against the current state, not the future result.
- **Rule**: Trimming (`createSetStartAction`) and moving (`createMoveAction`) must be executed as two separate transactions.

## 7. No Razor or Split
- **Rule**: There is no razor or split in the API. Emulate a cut by cloning the clip into free space and adjusting start/end times.

## 8. Ripple Delete Leaves Gaps
- **Rule**: `createRemoveItemsAction` with `ripple = true` leaves gaps. Run `timeline.closeGaps` after a series of edits.

## 9. getTrackItems Empty Handling
- **Rule**: `getTrackItems` does not return gaps. Filter out `null`s.

## 10. createSequence Uses Default Preset
- **Rule**: `createSequence` silently uses the default preset. Use `sequence.createCloneAction()` instead.

## 11. Do Not Create Project Items
- **Rule**: Subclips bloat the project. Make edits in place in a duplicate of the sequence.

## 12. Transcript Belongs to Source
- **Rule**: Transcript timings are in source seconds. A source-to-sequence mapping layer is mandatory.

## 13. Application.version
- **Rule**: `ppro.Application.version` does not work. Use `require("uxp").host.version`.

## 14. Bridge Isolation & Safety
- **Rule**: Only ONE Premiere bridge may drive a timeline at a time (the custom UXP "Premiere MCP Bridge" or the CEP premiere-pro-mcp, never both). Save the project before any batch edit.
