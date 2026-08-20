---
test: ../darkmode_test.md
status: passed
started: 2026-08-20T23:01:28.894Z
duration_s: 51
session_id: 7251d7ad-7864-410c-a174-4a9b05bf7545
---

# Dark mode persists across a reload — Result

## Open the notes app ✓ passed (0.75s)
md5: 4ee219e07ab4acaa0744c09bc921587c
Open http://localhost:5173 and wait for the "Kane Notes" heading to be visible.

## Turn on dark mode ✓ passed (6.8s)
md5: f4d98662c44b0bb57db9d254bc851b7a
Click the dark mode toggle in the header. Assert the page background is now a dark colour.

## Reload and check it stuck ✓ passed (39.6s)
md5: 0f4b30e5e45ea064025e1b99863a06a6
Reload the page. Assert the page background is still dark after the reload.
