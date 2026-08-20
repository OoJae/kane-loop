# Working agreement for Kane Notes

You are editing a small React app that is **already running** at http://localhost:5173.

## Rules

- **Edit only `./src`.** Never start, stop, or restart the dev server — it is already running and hot-reloads your saves.
- **Kane CLI verifies your work automatically.** After every file you save, a hook runs real-browser tests against the live app. You do not run them yourself.
- **When a run fails, the failure reason is injected into this conversation.** Read it literally — it describes what a real browser actually saw. Fix the **application code**, save, and Kane re-runs.
- **Never edit, weaken, delete, or add to `../tests/`.** Those flows are immutable ground truth. Making a test pass by changing the test is failing the task.
- **You cannot finish while Kane is red.** A completion gate re-runs the browser tests when you try to stop and will send you back to work.
- Prefer the smallest correct change. UI state that must survive a reload belongs in `localStorage`.
