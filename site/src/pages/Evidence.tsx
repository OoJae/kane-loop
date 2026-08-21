import { PageHead, SiteFooter, REPO, CONSOLE_URL } from '../components/Chrome'

const blob = (p: string) => `${REPO}/blob/main/${p}`

/**
 * Every figure on this page was read out of the committed NDJSON with jq, not
 * typed from memory. The `source` on each card is the file it came from, so a
 * reader can run the same query and get the same numbers.
 */
interface Run {
  phase: string
  status: 'passed' | 'failed'
  duration: number
  credits: number
  steps: string
  line: string
}

interface Recording {
  id: string
  title: string
  blurb: string
  lines: number
  span: number
  credits: number
  verdict: 'GREEN' | 'RED'
  outcome: string
  runs: Run[]
  /** Repo-relative paths — they differ per recording, so never build them by id. */
  eventsPath: string
  streamPath: string
}

const RECORDINGS: Recording[] = [
  {
    id: 'live-loop',
    title: 'The loop closing',
    blurb:
      'The one that matters. Kane catches the seeded bug in a browser, the failure is injected into the agent’s context, the agent fixes the code it just wrote, and the gate releases. No human input between the first save and the last verdict.',
    lines: 181,
    span: 82,
    credits: 2.0848,
    verdict: 'GREEN',
    outcome: 'gate released — every flow passes, oracle intact',
    eventsPath: 'evidence/ui/live-loop.events.ndjson',
    streamPath: 'evidence/ui/live-loop.stream.json',
    runs: [
      { phase: 'verify', status: 'failed', duration: 23, credits: 2.0848, steps: '3 / 4', line: 'failed assertion: the page background is still dark' },
      { phase: 'verify', status: 'passed', duration: 12, credits: 0, steps: '4 / 4', line: 'all steps passed' },
      { phase: 'gate', status: 'passed', duration: 11, credits: 0, steps: '4 / 4', line: 'all steps passed' },
    ],
  },
  {
    id: 'gate-blocks',
    title: 'The gate holding',
    blurb:
      'The less flattering one, kept because it is the more useful one. Here the agent does not manage the fix, and the Stop gate refuses to let it finish — four times, the cap — before releasing and handing off to a human. An agent trapped forever against a gate it cannot satisfy is a worse outcome than a person looking at it.',
    lines: 245,
    span: 169,
    credits: 14.4368,
    verdict: 'RED',
    outcome: 'blocked 4 times, then released for manual review',
    eventsPath: 'evidence/loop-terminal/gate-blocks-repeatedly.events.ndjson',
    streamPath: 'evidence/loop-terminal/gate-blocks-repeatedly.stream.json',
    runs: [
      { phase: 'gate', status: 'failed', duration: 27, credits: 2.803, steps: '3 / 4', line: 'failed assertion: the page background is still dark' },
      { phase: 'gate', status: 'failed', duration: 33, credits: 3.6576, steps: '3 / 4', line: 'failed assertion: the page background is still dark' },
      { phase: 'gate', status: 'failed', duration: 40, credits: 4.7686, steps: '3 / 4', line: 'failed assertion: the page background is still dark' },
      { phase: 'gate', status: 'failed', duration: 26, credits: 3.2076, steps: '3 / 4', line: 'failed assertion: the page background is still dark' },
    ],
  },
]

function Verdict({ v }: { v: 'GREEN' | 'RED' }) {
  const pass = v === 'GREEN'
  return (
    <span
      className="data inline-flex items-center gap-1.5 font-bold"
      style={{ color: pass ? '#34e39b' : '#ff3b52' }}
    >
      <span aria-hidden>{pass ? '✓' : '✕'}</span>
      {v}
    </span>
  )
}

export default function Evidence() {
  return (
    <div className="grain">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <PageHead label="evidence" title="Every number, and the file it came from">
        <p>
          Two runs are committed to this repository as raw NDJSON — both channels, the Kane event
          stream and the agent's own stream. You can replay either one line by line in the console,
          or read the file. Nothing on this site is a number I typed from memory; each one was read
          out of these files.
        </p>
      </PageHead>

      <main id="main" className="mx-auto max-w-[1400px] px-5 pb-24 lg:px-10">
        {RECORDINGS.map((r) => (
          <section key={r.id} className="border-t border-[color:var(--color-line)] py-[clamp(3rem,7vh,5rem)]">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
              <div>
                <div className="flex items-center gap-3">
                  <p className="label">{r.id}</p>
                  <Verdict v={r.verdict} />
                </div>
                <h2 className="display mt-3 text-[clamp(1.7rem,3.6vw,3rem)]">{r.title}</h2>
                <p className="mt-5 max-w-[46ch] text-[15.5px] leading-[1.7] text-[color:var(--color-dim)]">
                  {r.blurb}
                </p>

                <dl className="data mt-7 grid grid-cols-3 gap-4 border-t border-[color:var(--color-line)] pt-5">
                  <div>
                    <dt className="label">wall clock</dt>
                    <dd className="mt-1 text-[color:var(--color-ice)]">{r.span}s</dd>
                  </div>
                  <div>
                    <dt className="label">event lines</dt>
                    <dd className="mt-1 text-[color:var(--color-ice)]">{r.lines}</dd>
                  </div>
                  <div>
                    <dt className="label">kane credits</dt>
                    <dd className="mt-1 text-[color:var(--color-ice)]">{r.credits}</dd>
                  </div>
                </dl>

                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href={`${CONSOLE_URL}?replay=${r.id}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--color-ice)] px-4 py-2.5 text-[13.5px] font-semibold text-[color:var(--color-ink)] transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    Replay it →
                  </a>
                  <a
                    href={blob(r.eventsPath)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--color-line)] px-4 py-2.5 text-[13.5px] font-semibold transition-colors duration-200 hover:border-[color:var(--color-dim)]"
                  >
                    Kane events ↗
                  </a>
                  <a
                    href={blob(r.streamPath)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--color-line)] px-4 py-2.5 text-[13.5px] font-semibold transition-colors duration-200 hover:border-[color:var(--color-dim)]"
                  >
                    Agent stream ↗
                  </a>
                </div>
              </div>

              <div className="self-start overflow-hidden rounded-xl border border-[color:var(--color-line)]">
                <table className="w-full">
                  <caption className="sr-only">
                    Every Kane run in {r.id}, in order, from its committed event log
                  </caption>
                  <thead>
                    <tr className="border-b border-[color:var(--color-line)]">
                      {['phase', 'verdict', 'time', 'credits', 'steps'].map((h) => (
                        <th key={h} scope="col" className="label p-3.5 text-left font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="data">
                    {r.runs.map((run, i) => (
                      <tr key={i} className="border-b border-[color:var(--color-line)]">
                        <th scope="row" className="p-3.5 text-left font-normal text-[color:var(--color-dim)]">
                          {run.phase}
                        </th>
                        <td className="p-3.5">
                          <Verdict v={run.status === 'passed' ? 'GREEN' : 'RED'} />
                        </td>
                        <td className="p-3.5 text-[color:var(--color-ice)]">{run.duration}s</td>
                        <td className="p-3.5 text-[color:var(--color-dim)]">{run.credits}</td>
                        <td className="p-3.5 text-[color:var(--color-dim)]">{run.steps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-3.5">
                  <p className="label mb-2">gate_result</p>
                  <p className="data text-[color:var(--color-ice)]">{r.outcome}</p>
                </div>
              </div>
            </div>
          </section>
        ))}

        <section className="border-t border-[color:var(--color-line)] py-[clamp(3rem,7vh,5rem)]">
          <h2 className="display max-w-[24ch] text-[clamp(1.7rem,3.6vw,3rem)]">
            Check it yourself, in one command
          </h2>
          <p className="mt-6 max-w-[56ch] text-[15.5px] leading-[1.7] text-[color:var(--color-dim)]">
            The tables above are just <span className="data text-[color:var(--color-ice)]">jq</span>{' '}
            over the committed files. If a figure here disagrees with the file, the file is right and
            this page is wrong — that has happened before and it is written up in the{' '}
            <a
              href="/log"
              className="text-[color:var(--color-ice)] underline decoration-dotted underline-offset-4"
            >
              build log
            </a>
            .
          </p>
          <figure className="mt-8 overflow-hidden rounded-xl border border-[color:var(--color-line)]">
            <figcaption className="label border-b border-[color:var(--color-line)] px-4 py-2.5">
              from a clone of the repo
            </figcaption>
            <pre className="overflow-x-auto p-4">
              <code className="data whitespace-pre text-[color:var(--color-ice)]">{`jq -c 'select(.type=="test_md_summary")' \\
  evidence/ui/live-loop.events.ndjson

{"overall_status":"failed","duration_s":23,
 "steps":{"total":4,"passed":3,"failed":1,...}}
{"overall_status":"passed","duration_s":12,
 "steps":{"total":4,"passed":4,"failed":0,...}}
{"overall_status":"passed","duration_s":11,
 "steps":{"total":4,"passed":4,"failed":0,...}}`}</code>
            </pre>
          </figure>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
