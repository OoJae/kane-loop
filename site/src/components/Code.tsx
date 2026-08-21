/**
 * A code block. Every snippet on this site is copied out of a file in the repo
 * and captioned with where it came from, so a reader can diff it rather than
 * take my word for it. Long lines are re-wrapped to fit the column and comments
 * are sometimes trimmed; no token is changed.
 */
export function Code({
  source,
  href,
  children,
}: {
  source: string
  href?: string
  children: string
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-[color:var(--color-line)]">
      <figcaption className="label border-b border-[color:var(--color-line)] px-4 py-2.5">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-4 hover:text-[color:var(--color-ice)]"
          >
            {source}
          </a>
        ) : (
          source
        )}
      </figcaption>
      <pre className="overflow-x-auto p-4">
        <code className="data whitespace-pre text-[color:var(--color-ice)]">{children}</code>
      </pre>
    </figure>
  )
}
