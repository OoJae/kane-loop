---
mode: testing
max_steps: 12
timeout: 180
url: http://localhost:5173
---
# Dark mode persists across a reload

## Open the notes app
Open http://localhost:5173 and wait for the "Kane Notes" heading to be visible.

## Turn on dark mode
Click the dark mode toggle in the header. Assert the page background is now a dark colour.

## Reload and check it stuck
Reload the page. Assert the page background is still dark after the reload.
