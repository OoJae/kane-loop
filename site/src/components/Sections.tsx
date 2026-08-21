const REPO = 'https://github.com/OoJae/kane-loop'
const CONSOLE_URL = '/console/'

/**
 * The mechanism. Three hooks, because there are exactly three — the numbering
 * encodes a real sequence (before the write, after the write, at the end), not
 * decoration.
 */
const HOOKS = [
  {
    n: '01',
    when: 'before the write',
    file: 'kane-guard.sh',
    event: 'PreToolUse',
    body: 'Denies writes to the test flows and the recordings Kane replays. The cheapest way to turn red into green is to weaken the test, so that route is closed first.',
  },
  {
    n: '02',
    when: 'after every save',
    file: 'kane-verify.sh',
    event: 'PostToolUse',
    body: 'Runs the suite in a real Chrome and returns the failure as additionalContext — plus the path to Kane’s screenshot of the page that failed.',
  },
  {
    n: '03',
    when: 'when it tries to stop',
    file: 'kane-gate.sh',
    event: 'Stop',
    body: 'Re-runs the suite and blocks the agent from finishing while anything is red — up to four times, then hands off rather than fighting forever.',
  },
]

export function Mechanism() {
  return (
    <section id="mechanism" className="border-t border-[color:var(--color-line)]">
      <div className="mx-auto max-w-[1400px] px-5 py-[clamp(4rem,10vh,8rem)] lg:px-10">
        <p className="label">the mechanism</p>
        <h2 className="display mt-4 max-w-[22ch] text-[clamp(2rem,5.6vw,5rem)]">
          Three hooks, and none of them are optional
        </h2>
        <p className="mt-6 max-w-[58ch] text-[clamp(1rem,1.05vw,1.15rem)] leading-[1.6] text-[color:var(--color-dim)]">
          Plenty of agents can drive a browser — but only when the model decides to call the
          tool. That is the gap:{' '}
          <a
            href="https://arxiv.org/abs/2510.20270"
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--color-ice)] underline decoration-dotted underline-offset-4"
          >
            ImpossibleBench
          </a>{' '}
          measures GPT-5 taking a spec-violating shortcut on 54% of tasks whose tests it could not
          honestly pass. A hook is not a tool: the runtime fires it on every save, whether the model
          wants it or not.
        </p>

        <ol className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-line)] md:grid-cols-3">
          {HOOKS.map((h) => (
            <li key={h.n} className="bg-[color:var(--color-ink)] p-7">
              <div className="flex items-baseline justify-between gap-3">
                <span className="data font-bold text-[color:var(--color-pass)]">{h.n}</span>
                <span className="label">{h.when}</span>
              </div>
              <h3 className="data mt-6 text-[15px] font-bold text-[color:var(--color-ice)]">
                {h.file}
              </h3>
              <p className="label mt-1">{h.event}</p>
              <p className="mt-4 text-[14.5px] leading-[1.65] text-[color:var(--color-dim)]">
                {h.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/**
 * The receipts. Quiet, monospace, and every line links somewhere you can check.
 * This is the Verified axis made into a section.
 */
export function Receipts() {
  return (
    <section id="receipts" className="border-t border-[color:var(--color-line)]">
      <div className="mx-auto max-w-[1400px] px-5 py-[clamp(4rem,10vh,8rem)] lg:px-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
          <div>
            <p className="label">the receipts</p>
            <h2 className="display mt-4 max-w-[13ch] text-[clamp(2rem,5.2vw,4.6rem)]">
              Nothing here is mocked
            </h2>
            <p className="mt-6 max-w-[46ch] text-[clamp(1rem,1.05vw,1.15rem)] leading-[1.6] text-[color:var(--color-dim)]">
              The demo app ships with a real seeded bug: a dark-mode toggle held in React state
              with no persistence. Kane catches it in a browser, the agent fixes it, and both runs
              are committed as raw NDJSON.
            </p>

            <a
              href={`${REPO}/tree/main/evidence`}
              target="_blank"
              rel="noreferrer"
              className="label mt-8 inline-flex items-center gap-2 border-b border-[color:var(--color-line)] pb-1 transition-colors hover:text-[color:var(--color-ice)]"
            >
              browse the evidence ↗
            </a>
          </div>

          <div className="self-start overflow-hidden rounded-xl border border-[color:var(--color-line)]">
            <table className="w-full">
              <caption className="sr-only">
                Kane results before and after the fix, from committed run logs
              </caption>
              <thead>
                <tr className="border-b border-[color:var(--color-line)]">
                  {['', 'exit', 'kane', 'steps'].map((h) => (
                    <th key={h} scope="col" className="label p-4 text-left font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="data">
                <tr className="border-b border-[color:var(--color-line)]">
                  <th scope="row" className="p-4 text-left font-bold text-[color:var(--color-fail)]">
                    <span aria-hidden>✕</span> RED
                  </th>
                  <td className="p-4 text-[color:var(--color-ice)]">1</td>
                  <td className="p-4 text-[color:var(--color-dim)]">23s</td>
                  <td className="p-4 text-[color:var(--color-dim)]">3 passed, 1 failed</td>
                </tr>
                <tr>
                  <th scope="row" className="p-4 text-left font-bold text-[color:var(--color-pass)]">
                    <span aria-hidden>✓</span> GREEN
                  </th>
                  <td className="p-4 text-[color:var(--color-ice)]">0</td>
                  <td className="p-4 text-[color:var(--color-dim)]">12s</td>
                  <td className="p-4 text-[color:var(--color-dim)]">4 / 4 passed</td>
                </tr>
              </tbody>
            </table>

            <div className="border-t border-[color:var(--color-line)] p-4">
              <p className="label mb-2">
                source:{' '}
                <a
                  href={`${REPO}/blob/main/evidence/ui/live-loop.events.ndjson`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted underline-offset-4 hover:text-[color:var(--color-ice)]"
                >
                  live-loop.events.ndjson
                </a>
              </p>
            </div>

            <div className="border-t border-[color:var(--color-line)] p-4">
              <p className="label mb-2">what the agent was handed</p>
              <p className="data text-[color:var(--color-ice)]">
                <span className="text-[color:var(--color-fail)]">failed assertion:</span>{' '}
                "the page background is still dark"
                <span className="text-[color:var(--color-dim)]"> (assertion_failed: @ step 2)</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function TryIt() {
  return (
    <section id="try" className="border-t border-[color:var(--color-line)]">
      <div className="mx-auto max-w-[1400px] px-5 py-[clamp(4rem,12vh,9rem)] lg:px-10">
        <h2 className="display max-w-[18ch] text-[clamp(2.2rem,7vw,6rem)]">
          Give your agent eyes and a spine
        </h2>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center">
          <a
            href={`${CONSOLE_URL}?replay=live-loop`}
            className="group inline-flex items-center gap-2.5 rounded-lg bg-[color:var(--color-ice)] px-5 py-3 text-[14px] font-semibold text-[color:var(--color-ink)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Watch a real run
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </a>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-lg border border-[color:var(--color-line)] px-5 py-3 text-[14px] font-semibold transition-colors duration-200 hover:border-[color:var(--color-dim)]"
          >
            Read the source ↗
          </a>
        </div>

        <p className="mt-16 max-w-[52ch] text-[clamp(1rem,1.05vw,1.15rem)] leading-[1.7] text-[color:var(--color-dim)]">
          Kane Loop runs locally by design — it drives a real Chrome on your machine. Clone it and
          run one command. In the recording above, first event to gate release took{' '}
          <span className="data text-[color:var(--color-ice)]">82 seconds</span>.
        </p>
      </div>
    </section>
  )
}
