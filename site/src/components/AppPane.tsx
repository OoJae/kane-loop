/**
 * The real Kane Notes UI, rebuilt from target-app/src/App.tsx.
 *
 * This is live DOM inside a CSS 3D transform, not a texture or a screenshot.
 * That is the whole reason there is no WebGL on this page: the hero has to be
 * the actual product, with real text rendering, and it has to flip light→dark
 * because the seeded bug IS a theme-persistence bug.
 */
interface AppPaneProps {
  /** false = light. Light after a reload is the bug. */
  dark: boolean
  /** Mid-reload: the pane blanks the way a real reload does. */
  reloading: boolean
}

export function AppPane({ dark, reloading }: AppPaneProps) {
  return (
    <div
      className="w-full overflow-hidden rounded-xl border shadow-2xl transition-colors duration-300"
      style={{
        background: dark ? '#0a0b0d' : '#f4f5f7',
        borderColor: dark ? '#1e2128' : '#dfe3e8',
        transitionTimingFunction: 'var(--ease-flip)',
      }}
    >
      {/* chrome */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: dark ? '#1e2128' : '#dfe3e8' }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#ff5f57' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#febc2e' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#28c840' }} />
        <span
          className="ml-2 truncate font-mono text-[11px]"
          style={{ color: dark ? '#5c6470' : '#8b939f' }}
        >
          localhost:5173
        </span>
      </div>

      <div
        className="px-6 py-6 transition-opacity duration-200 sm:px-8 sm:py-8"
        style={{ opacity: reloading ? 0 : 1 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3
              className="text-[26px] font-bold tracking-tight sm:text-[30px]"
              style={{ color: dark ? '#f3f5f8' : '#14161a' }}
            >
              Kane Notes
            </h3>
            <p className="mt-1 text-[13px]" style={{ color: dark ? '#8b939f' : '#5c6470' }}>
              A small place for quick thoughts.
            </p>
          </div>

          {/* the toggle the whole product is about */}
          <div
            className="flex shrink-0 items-center gap-2.5 rounded-full px-3 py-2 shadow-sm"
            style={{ background: dark ? '#14161a' : '#ffffff' }}
          >
            <span className="text-[13px]" style={{ color: dark ? '#f3f5f8' : '#14161a' }}>
              Dark mode
            </span>
            <span
              className="relative h-[18px] w-[34px] rounded-full transition-colors duration-300"
              style={{
                background: dark ? '#34e39b' : '#dfe3e8',
                transitionTimingFunction: 'var(--ease-flip)',
              }}
            >
              <span
                className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform duration-300"
                style={{
                  transform: `translateX(${dark ? 18 : 2}px)`,
                  transitionTimingFunction: 'var(--ease-flip)',
                }}
              />
            </span>
          </div>
        </div>

        <p
          className="mt-6 font-mono text-[10px] tracking-[0.08em] uppercase"
          style={{ color: dark ? '#5c6470' : '#8b939f' }}
        >
          New note
        </p>
        <div className="mt-2 flex gap-2">
          <div
            className="h-[38px] flex-1 rounded-lg border px-3 text-[13px] leading-[38px]"
            style={{
              background: dark ? '#101216' : '#ffffff',
              borderColor: dark ? '#1e2128' : '#dfe3e8',
              color: dark ? '#5c6470' : '#8b939f',
            }}
          >
            Write a note…
          </div>
          <div
            className="grid h-[38px] shrink-0 place-items-center rounded-lg px-4 text-[13px] font-medium text-white"
            style={{ background: '#2f6df6' }}
          >
            Add note
          </div>
        </div>

        <div
          className="mt-6 rounded-lg border p-4"
          style={{
            background: dark ? '#101216' : '#ffffff',
            borderColor: dark ? '#1e2128' : '#dfe3e8',
          }}
        >
          <p className="text-[13px]" style={{ color: dark ? '#f3f5f8' : '#14161a' }}>
            Welcome to Kane Notes. Type below to add your first note.
          </p>
        </div>
      </div>
    </div>
  )
}
