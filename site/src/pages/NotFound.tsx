import { Link } from 'react-router-dom'
import { PageHead, SiteFooter } from '../components/Chrome'

/**
 * A real 404. The server's SPA fallback answers every unknown path with this
 * bundle, so without a catch-all route a typo would silently render the landing
 * page and look like a working URL.
 */
export default function NotFound() {
  return (
    <div className="grain flex min-h-screen flex-col">
      <PageHead label="404" title="No such page">
        <p>
          That URL does not exist here. It is a genuine 404 rather than the homepage pretending —
          which felt like the least this particular project could do.
        </p>
      </PageHead>
      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-5 lg:px-10">
        <ul className="label flex flex-wrap gap-x-6 gap-y-3 border-t border-[color:var(--color-line)] pt-8">
          {[
            ['/', 'the landing page'],
            ['/how-it-works', 'how it works'],
            ['/evidence', 'evidence'],
            ['/log', 'build log'],
          ].map(([to, label]) => (
            <li key={to}>
              <Link className="transition-colors hover:text-[color:var(--color-ice)]" to={to!}>
                {label} →
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  )
}
