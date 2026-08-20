---
mode: testing
max_steps: 16
timeout: 240
url: http://localhost:5173
---
# Add note button is disabled until a note is typed

## Open the notes app
Open http://localhost:5173 and wait for the "Kane Notes" heading to be visible.

## The Add note button starts disabled
Assert that the "Add note" button is disabled while the note input is empty.

## Type a note
Type "Buy milk" into the note text input.

## The Add note button becomes enabled
Assert that the "Add note" button is now enabled.
