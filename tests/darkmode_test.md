---
mode: testing
max_steps: 16
timeout: 240
url: http://localhost:5173
---
# Dark mode persists across a reload

## Open the notes app
Open http://localhost:5173 and wait for the "Kane Notes" heading to be visible.

## Turn on dark mode
Click the dark mode toggle in the header. Assert the page background is now a dark colour.

## Load the page again from scratch
Navigate to http://localhost:5173 again so the page loads completely fresh, and wait for the "Kane Notes" heading to be visible.

## Verify dark mode survived
Assert that the page background is still dark.
