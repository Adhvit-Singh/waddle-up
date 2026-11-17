# Round 3 — Play-test fixes (approved 2026-11-18)

User reported 7 problems after playing round 2. Each one was investigated before choosing a fix. Approved: "yep make it happen".

| # | Problem | Root cause (verified) | Fix |
|---|---|---|---|
| 1 | After fake summit 1 you end up halfway up the next tier | Round-2 taper made the plateau (r 22) barely wider than the rising tier (r 21); the cutscene stands the penguin at r 19.3, **inside** the rising rock | Tiers 27.5 / 23→19 / 14.5→8.5 (at least 4.5 m plateau ring). Flag + cutscene stand placed in the middle of the free ring, crags on the rim edge, all outside the rising rock |
| 2 | F10 pauses the game; stage buttons do nothing | Opening the menu frees the mouse → "lost pointer lock" pauses; clicking re-captures the mouse so buttons never get the click; `devGotoStage` refuses while paused | While the dev menu is open: no pause on unlock, no auto re-capture. Picking a stage closes the menu and re-captures |
| 3 | Gusts too strong | — | Gust strength ×0.5 (windy stages and the gust trap) |
| 4 | Camera jammed against the rock | Collision pulls the camera in to 0.8 m when rock is behind the penguin | Option (a): when the camera is blocked it swings its yaw toward "outward from the mountain" (collision pull-in kept as a safety net) |
| 5 | Grab a ledge on the loop above and skip a round | Top tier (r 11.5→5.5, Unity layout) winds so tightly that loops are 3–3.5 m apart: jump + auto-grab reaches 3.5 m (16 skip routes found) | Wider top tier (0 skip routes) **plus** rule: you can't grab a ledge more than 2 ahead of the last ledge you stood on |
| 6 | Stage 18 head-bump spots | Same tight top tier (lowest ceiling 1.66 m) | Same widening: 0 tight spots, lowest ceiling 2.78 m |
| 7 | Esc unpauses | — | Esc can't unpause (only clicking RESUME); Esc still closes Settings / How to Play / confirm. RESUME always dodges 4–7 times |

Invariants kept (tests): every jump identical (rise/gap/size fixture), no rock in ledge corridors, no walkable rock off-path,
no headroom below 2.6 m (no exceptions any more), no geometric skip routes.

Plan: one commit per fix, each with a failing test first (unit test, or e2e where only the browser can show it), then the
full e2e set, build scan, Unity untouched check, GAME_LOG update.
