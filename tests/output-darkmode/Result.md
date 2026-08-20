---
test: ../darkmode_test.md
status: passed
started: 2026-08-20T23:10:21.048Z
duration_s: 56
session_id: 42c012e3-fa02-484d-97ee-07876cffb80e
---

# Dark mode persists across a reload — Result

## Open the notes app ✓ passed (3.81s)
md5: 4ee219e07ab4acaa0744c09bc921587c
Open http://localhost:5173 and wait for the "Kane Notes" heading to be visible.

## Turn on dark mode ✓ passed (7.53s)
md5: f4d98662c44b0bb57db9d254bc851b7a
Click the dark mode toggle in the header. Assert the page background is now a dark colour.

## Load the page again from scratch ✓ passed (0.1s)
md5: 09f689f2af179d0a180e1c41fc6c3be2
Navigate to http://localhost:5173 again so the page loads completely fresh, and wait for the "Kane Notes" heading to be visible.

## Verify dark mode survived ✓ passed (40.6s)
md5: 8c889b82f9cda7cc626740c081a696db
Assert that the page background is still dark.
