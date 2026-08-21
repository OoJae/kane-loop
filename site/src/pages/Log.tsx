import { PageHead, SiteFooter, REPO } from '../components/Chrome'

const commit = (h: string) => `${REPO}/commit/${h}`

interface Entry {
  hash: string
  kind: 'retraction' | 'bypass' | 'design'
  title: string
  body: string[]
}

/**
 * The build log. Every entry links to the commit that fixed it, which is the
 * only reason it is worth publishing — a list of bugs nobody can check is
 * marketing, and a list of bugs anyone can check is a receipt.
 */
const ENTRIES: Entry[] = [
  {
    hash: '03ae112',
    kind: 'retraction',
    title: 'The README’s most load-bearing sentence was false',
    body: [
      'The hero caption said “the raw event log for this exact run is committed at live-loop.events.ndjson — every number on screen is in it”. The image showed 3.99 credits. That file sums to 2.08, has three verdicts and not four, and the agent line quoted in the caption appears in no tracked file. 3.99 appears in no committed NDJSON anywhere in this repository’s history.',
      'The cause was drift, not invention. The screenshot was frozen while capture-run.sh silently overwrote live-loop.events.ndjson from a later run. The run was real; the pairing rotted.',
      'Fixed by re-shooting the hero from ?replay=live-loop, which renders that exact committed file line by line — so every number on screen is in it by construction. capture-run.sh now warns when a capture lands beside an older image of the same name.',
    ],
  },
  {
    hash: '7cbffad',
    kind: 'retraction',
    title: 'Ten screenshots showed a URL that never existed',
    body: [
      'A tracked image rendered test_url app.testmuai.com/runs/demo-red-run — a fabricated URL on the judges’ own domain. Another showed hand-authored prose with no DEMO banner in frame.',
      'The demo script that produced them had already been destroyed in an earlier commit for exactly this reason. It had survived in images, which nothing was checking. All ten were removed.',
    ],
  },
  {
    hash: 'c73b22b',
    kind: 'retraction',
    title: 'A citation that said what I wanted it to say',
    body: [
      'The README cited ImpossibleBench to argue for hiding tests from the agent. The paper actually says hiding them “reduces cheating success rate to near zero”, and that read-only — what this project does — is only “a middle ground” that “does not eliminate other cheating methods”.',
      'The honest version is now in the README: Kane Loop keeps the objectives readable on purpose, because an agent that cannot read the spec cannot satisfy it, and that is exactly why the SHA-256 manifest exists as a second layer rather than as decoration.',
    ],
  },
  {
    hash: '7624816',
    kind: 'bypass',
    title: 'The gate blocked exactly once',
    body: [
      'The Stop hook released whenever stop_hook_active was true. That flag is true on every stop attempt after the first block — so the gate blocked once and the agent could finish red on its second try, with the block cap never reached.',
      'This is the worst class of bug in a project like this: the feature appears to work, demos correctly, and quietly guarantees nothing. Replaced with a strictly-increasing counter capped at four.',
    ],
  },
  {
    hash: '5f02dac',
    kind: 'bypass',
    title: 'rm -rf tests defeated the whole thing',
    body: [
      'The gate’s integrity check sat below its empty-suite branch. Deleting the flows emptied the suite, the empty-suite branch released, and the oracle was never consulted.',
      'The check was hoisted above every precondition. It is a pure filesystem checksum — it needs no kane-cli, no dev server and no lock — so there was never a reason for it to run last. Deleting the flows now moves the manifest, lands on the checksum, and blocks.',
    ],
  },
  {
    hash: 'd10fdd0',
    kind: 'bypass',
    title: 'The Run button was remote code execution',
    body: [
      'POST /run passed a user-supplied prompt to the Claude binary. -p is a boolean flag, so a prompt beginning with a dash was parsed as an option — and --settings=<json> executes hooks. Any origin that could reach the endpoint could run arbitrary code.',
      'Fixed by rejecting a leading dash outright and passing -p -- prompt so nothing after the separator can be read as a flag. Verified by firing the exploit: 400, and no marker file.',
    ],
  },
  {
    hash: '6f7a599',
    kind: 'bypass',
    title: 'Fourteen shell bypasses of the oracle guard',
    body: [
      'A shell is a write primitive wearing a disguise. The guard was denying Edit and Write to the flows while allowing rm, mv, cp, tee, sed -i, truncate, redirects, heredocs, find -delete, and a cd into the directory first.',
      'The Bash branch became default-deny with a read-only verb allowlist. One accepted false positive remains: a jq filter containing a quoted pipe is denied, because the parse that would allow it would also allow rm -f "tests/x".',
    ],
  },
  {
    hash: 'c73e69b',
    kind: 'design',
    title: 'A seal taken at the gate certifies the tamper',
    body: [
      'The oracle manifest was originally sealed by the Stop gate. The gate runs last — after every edit of the session — so a seal taken there would be taken after any tampering and would happily certify it as the baseline.',
      'It now seals on the first verified save of a session, before the agent has had a chance to touch anything.',
    ],
  },
  {
    hash: 'ab3ce42',
    kind: 'design',
    title: 'The UI painted GREEN when the oracle was tampered',
    body: [
      'The console branched on `if (status === "red")` to decide whether to show failure. A third status exists — tampered — so the one state that means “this result cannot be trusted” rendered as success.',
      'Inverted to `if (status === "green")`, so anything that is not an explicit pass is treated as not a pass. Found in the same audit: a stale seal survived demo-reset, producing a false “tampered” at the exact moment of the demo.',
    ],
  },
  {
    hash: 'd549231',
    kind: 'design',
    title: 'Proxying websockets killed the dev server',
    body: [
      'The container proxies Vite so the app pane renders on one origin. Setting ws: true on that proxy hijacked the console’s own WebSocket — the one carrying the live event stream — and the UI went silent.',
      'ws: false is load-bearing and is commented as such at the call site, because it looks exactly like an oversight.',
    ],
  },
]

const KIND_LABEL: Record<Entry['kind'], string> = {
  retraction: 'retraction',
  bypass: 'bypass closed',
  design: 'design error',
}

export default function Log() {
  return (
    <div className="grain">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <PageHead label="build log" title="What the loop caught in its own construction">
        <p>
          Kane Loop is a project about whether you can trust what an agent tells you it did. It
          would be strange to build that and then publish only the parts that went well.
        </p>
        <p className="mt-4">
          These are the real ones — three retractions where this repository claimed something that
          was not true, four bypasses that would have made a green meaningless, and three design
          errors that looked like working features. Every entry links to the commit that fixed it.
        </p>
      </PageHead>

      <main id="main" className="mx-auto max-w-[1400px] px-5 pb-24 lg:px-10">
        <ol className="border-t border-[color:var(--color-line)]">
          {ENTRIES.map((e) => (
            <li
              key={e.hash}
              className="grid grid-cols-1 gap-6 border-b border-[color:var(--color-line)] py-[clamp(2.25rem,5vh,3.5rem)] lg:grid-cols-[minmax(0,0.3fr)_minmax(0,1fr)] lg:gap-14"
            >
              <div>
                <p
                  className="label"
                  style={{ color: e.kind === 'retraction' ? '#ff3b52' : undefined }}
                >
                  {KIND_LABEL[e.kind]}
                </p>
                <a
                  href={commit(e.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="data mt-2 inline-block text-[color:var(--color-dim)] underline decoration-dotted underline-offset-4 transition-colors hover:text-[color:var(--color-ice)]"
                >
                  {e.hash} ↗
                </a>
              </div>

              <div>
                <h2 className="max-w-[28ch] text-[clamp(1.3rem,2.3vw,1.9rem)] leading-[1.28] font-medium tracking-[-0.02em] text-[color:var(--color-ice)]">
                  {e.title}
                </h2>
                {e.body.map((p, i) => (
                  <p
                    key={i}
                    className="mt-4 max-w-[68ch] text-[15.5px] leading-[1.7] text-[color:var(--color-dim)]"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>

        <section className="py-[clamp(3rem,7vh,5rem)]">
          <h2 className="display max-w-[22ch] text-[clamp(1.7rem,3.6vw,3rem)]">
            The point is not that there were bugs
          </h2>
          <div className="mt-6 max-w-[60ch] space-y-4 text-[15.5px] leading-[1.7] text-[color:var(--color-dim)]">
            <p>
              Every one of these was found by looking for it — two full adversarial audits, and a
              habit of checking each number in a document against the file it claims to come from.
              None was found by the tool telling me it was fine.
            </p>
            <p>
              That is the same argument the project makes about agents. An agent that says “done”
              is reporting an intention, not a result. The only thing that settles it is something
              outside the agent that actually looks.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="/evidence"
              className="inline-flex items-center gap-2.5 rounded-lg bg-[color:var(--color-ice)] px-5 py-3 text-[14px] font-semibold text-[color:var(--color-ink)] transition-transform duration-200 hover:-translate-y-0.5"
            >
              See the evidence →
            </a>
            <a
              href={`${REPO}/commits/main`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 rounded-lg border border-[color:var(--color-line)] px-5 py-3 text-[14px] font-semibold transition-colors duration-200 hover:border-[color:var(--color-dim)]"
            >
              Every commit ↗
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
