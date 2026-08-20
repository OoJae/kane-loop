/** Small pure formatting helpers shared across panes. */

export function clockTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * Kane reports `duration` without a documented unit. Values that look like
 * seconds (< 1000) are promoted to milliseconds; strings like "34.2s" and
 * "1200ms" are parsed too.
 */
export function toMillis(duration: number | string | undefined): number | undefined {
  if (duration === undefined || duration === null) return undefined
  if (typeof duration === 'number') {
    if (!Number.isFinite(duration) || duration < 0) return undefined
    return duration < 1000 ? Math.round(duration * 1000) : Math.round(duration)
  }
  const trimmed = duration.trim()
  const msMatch = /^([\d.]+)\s*ms$/i.exec(trimmed)
  if (msMatch) return Math.round(Number(msMatch[1]))
  const sMatch = /^([\d.]+)\s*s(ec(onds)?)?$/i.exec(trimmed)
  if (sMatch) return Math.round(Number(sMatch[1]) * 1000)
  const asNumber = Number(trimmed)
  if (Number.isFinite(asNumber)) return toMillis(asNumber)
  return undefined
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/** Keep long absolute paths legible: last three segments, prefixed with an ellipsis. */
export function shortenPath(path: string, segments = 3): string {
  const clean = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts.length <= segments) return clean
  return `…/${parts.slice(-segments).join('/')}`
}

const FILE_TOOLS = new Set([
  'Edit',
  'Write',
  'Read',
  'MultiEdit',
  'NotebookEdit',
  'NotebookRead',
])

/** "Edit → src/App.tsx" — the compact right-hand side of a tool_use chip. */
export function describeTool(name: string, input: Record<string, unknown>): string {
  const str = (key: string): string | undefined => {
    const value = input[key]
    return typeof value === 'string' && value.trim() ? value : undefined
  }

  if (FILE_TOOLS.has(name)) {
    const file = str('file_path') ?? str('notebook_path') ?? str('path')
    if (file) return shortenPath(file, 2)
  }
  if (name === 'Bash' || name === 'BashOutput') {
    const command = str('command')
    if (command) return truncate(command.replace(/\s+/g, ' '), 64)
  }
  if (name === 'Grep' || name === 'Glob') {
    const pattern = str('pattern')
    const where = str('path')
    if (pattern) return truncate(where ? `${pattern} in ${shortenPath(where, 2)}` : pattern, 64)
  }
  if (name === 'Task' || name === 'Agent') {
    const description = str('description')
    if (description) return truncate(description, 64)
  }
  if (name === 'TodoWrite') {
    const todos = input.todos
    if (Array.isArray(todos)) return `${todos.length} items`
  }
  if (name === 'WebFetch' || name === 'WebSearch') {
    const q = str('url') ?? str('query')
    if (q) return truncate(q, 64)
  }

  const firstString = Object.values(input).find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
  return firstString ? truncate(firstString.replace(/\s+/g, ' '), 64) : ''
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** Flatten anthropic-style content (string | blocks | anything) into plain text. */
export function textOf(content: unknown): string {
  if (content === undefined || content === null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const record = part as Record<string, unknown>
          if (typeof record.text === 'string') return record.text
          if (typeof record.content === 'string') return record.content
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof content === 'object') {
    const record = content as Record<string, unknown>
    if (typeof record.text === 'string') return record.text
    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return String(content)
    }
  }
  return String(content)
}

export function firstLine(text: string, max = 90): string {
  const line = text.split('\n').find((candidate) => candidate.trim().length > 0) ?? ''
  return truncate(line.trim(), max)
}

export function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

export function isHttpUrl(value: string | undefined): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}
