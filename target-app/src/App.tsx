import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type Note = {
  id: string
  text: string
  createdAt: string
}

function createId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function App() {
  const [isDark, setIsDark] = useState(false)
  const [draft, setDraft] = useState('')
  const [notes, setNotes] = useState<Note[]>([
    {
      id: createId(),
      text: 'Welcome to Kane Notes. Type below to add your first note.',
      createdAt: new Date().toISOString(),
    },
  ])

  useEffect(() => {
    document.body.dataset.theme = isDark ? 'dark' : 'light'
  }, [isDark])

  function toggleTheme() {
    setIsDark((previous) => !previous)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) {
      return
    }
    setNotes((previous) => [
      { id: createId(), text, createdAt: new Date().toISOString() },
      ...previous,
    ])
    setDraft('')
  }

  function deleteNote(id: string) {
    setNotes((previous) => previous.filter((note) => note.id !== id))
  }

  return (
    <div className="app" data-theme={isDark ? 'dark' : 'light'}>
      <div className="shell">
        <header className="header">
          <div className="brand">
            <h1 className="brand-title">Kane Notes</h1>
            <p className="brand-subtitle">A small place for quick thoughts.</p>
          </div>

          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            aria-pressed={isDark}
            title="Toggle dark mode"
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {isDark ? '☀' : '☾'}
            </span>
            <span className="theme-toggle-label">Dark mode</span>
            <span className="theme-toggle-switch" aria-hidden="true">
              <span className="theme-toggle-knob" />
            </span>
          </button>
        </header>

        <main className="main">
          <form className="composer" onSubmit={handleSubmit}>
            <label className="composer-label" htmlFor="note-input">
              New note
            </label>
            <div className="composer-row">
              <input
                id="note-input"
                className="composer-input"
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a note..."
                autoComplete="off"
                aria-label="Note text"
              />
              <button type="submit" className="composer-button">
                Add note
              </button>
            </div>
          </form>

          <section className="notes" aria-label="Notes">
            <div className="notes-header">
              <h2 className="notes-title">Notes</h2>
              <span className="notes-count">{notes.length}</span>
            </div>

            {notes.length === 0 ? (
              <p className="empty">No notes yet. Add one above.</p>
            ) : (
              <ul className="note-list">
                {notes.map((note) => (
                  <li key={note.id} className="note-card">
                    <p className="note-text">{note.text}</p>
                    <div className="note-meta">
                      <time className="note-time" dateTime={note.createdAt}>
                        {formatTime(note.createdAt)}
                      </time>
                      <button
                        type="button"
                        className="note-delete"
                        onClick={() => deleteNote(note.id)}
                        aria-label={`Delete note: ${note.text}`}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <footer className="footer">Kane Notes</footer>
      </div>
    </div>
  )
}
