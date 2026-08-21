import type { Recording } from '../lib/replay'
import { RECORDINGS } from '../lib/replay'

const REPO = 'https://github.com/OoJae/kane-loop'

interface ReplayBannerProps {
  recording: Recording
}

/**
 * Deliberately different from the amber DEMO banner — this one is making a
 * stronger claim, so it has to be checkable. It names the exact committed file
 * and links it, because a label a reader can verify in ten seconds cannot be
 * read as a cover story. "Trust us" and "here are the bytes" are not the same
 * sentence.
 */
export function ReplayBanner({ recording }: ReplayBannerProps) {
  return (
    <div className="border-b-2 border-accent/70 bg-accent/10">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <span className="rounded bg-accent px-2 py-1 font-mono text-[11px] font-black tracking-[0.14em] text-[#04121c] uppercase">
          Recorded run · not live
        </span>

        <p className="min-w-[22ch] flex-1 text-[13px] leading-snug text-fg">
          <span className="font-semibold">{recording.title}.</span>{' '}
          <span className="text-dim">
            Every line below is replayed verbatim from a log committed in the repo — no scripted
            data. Kane Loop drives a real Chrome on your machine, so the loop itself only runs
            locally; this page is the recording of a session that happened.
          </span>
        </p>

        <a
          href={`${REPO}/blob/main/${recording.sourcePath}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded border border-accent/60 px-2.5 py-1 font-mono text-[11px] font-bold tracking-wider text-accent uppercase transition-colors hover:bg-accent/20"
        >
          View the raw log ↗
        </a>
        <a
          href={REPO}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded border border-line px-2.5 py-1 font-mono text-[11px] font-bold tracking-wider text-dim uppercase transition-colors hover:border-accent/60 hover:text-accent"
        >
          Run it yourself ↗
        </a>

        {RECORDINGS.length > 1 && (
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-dim">
            {RECORDINGS.map((r) => (
              <a
                key={r.id}
                href={`?replay=${r.id}`}
                className={
                  r.id === recording.id
                    ? 'rounded border border-accent/60 bg-accent/20 px-2 py-1 font-bold text-accent'
                    : 'rounded border border-line px-2 py-1 transition-colors hover:border-accent/60 hover:text-accent'
                }
              >
                {r.id}
              </a>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
