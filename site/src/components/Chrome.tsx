import { Link, NavLink } from 'react-router-dom'

export const REPO = 'https://github.com/OoJae/kane-loop'
export const CONSOLE_URL = '/console/'

const NAV = [
  { to: '/how-it-works', label: 'how it works' },
  { to: '/evidence', label: 'evidence' },
  { to: '/log', label: 'log' },
]

/**
 * The mark: a loop caught mid-close. The green arc runs at a tighter radius so
 * its end tucks inside the red one's start — the ends pass, they do not meet.
 * `draw` opts into the hero's entrance animation; everywhere else it is static.
 */
export function Mark({ className = 'h-7 w-7', draw = false }: { className?: string; draw?: boolean }) {
  const attrs = draw ? { 'data-draw': true, strokeDasharray: 200 } : {}
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <g fill="none" strokeWidth="7" strokeLinecap="round">
        <path d="M 32 6 A 26 26 0 0 1 32 58" stroke="#ff3b52" {...attrs} />
        <path d="M 32 58 A 22 22 0 0 1 32 14" stroke="#34e39b" {...attrs} />
      </g>
    </svg>
  )
}

export function SiteNav({ drawMark = false }: { drawMark?: boolean }) {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3" aria-label="Main">
      <Link to="/" className="flex items-center gap-2.5" aria-label="Kane Loop, home">
        <Mark draw={drawMark} />
        <span className="display text-[15px]" style={{ fontStretch: '110%' }}>
          Kane&nbsp;Loop
        </span>
      </Link>

      <div className="label flex flex-wrap items-center gap-x-3.5 gap-y-2 sm:gap-x-6">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `transition-colors hover:text-[color:var(--color-ice)] ${
                isActive ? 'text-[color:var(--color-ice)]' : ''
              }`
            }
          >
            {n.label}
          </NavLink>
        ))}
        <a
          className="transition-colors hover:text-[color:var(--color-ice)]"
          href={REPO}
          target="_blank"
          rel="noreferrer"
        >
          github ↗
        </a>
      </div>
    </nav>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[color:var(--color-line)]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-5 py-8 lg:px-10">
        <p className="label">Kane Loop · built for the Kane CLI hackathon</p>
        <p className="label">real browser · real verdict</p>
      </div>
    </footer>
  )
}

/**
 * Every page below the landing page shares this shell: a stated label, one
 * display headline, a standfirst, then whatever the page is.
 */
export function PageHead({
  label,
  title,
  children,
}: {
  label: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <header className="mx-auto max-w-[1400px] px-5 pt-8 lg:px-10">
      <SiteNav />
      <div className="pt-[clamp(3rem,9vh,6rem)] pb-[clamp(2rem,5vh,3.5rem)]">
        <p className="label">{label}</p>
        <h1 className="display mt-4 max-w-[20ch] text-[clamp(1.75rem,8vw,5rem)]">{title}</h1>
        {children ? (
          <div className="mt-7 max-w-[62ch] text-[clamp(1rem,1.05vw,1.15rem)] leading-[1.7] text-[color:var(--color-dim)]">
            {children}
          </div>
        ) : null}
      </div>
    </header>
  )
}
