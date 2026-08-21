import { PageHead, SiteFooter, REPO } from '../components/Chrome'
import { Code } from '../components/Code'

const blob = (p: string) => `${REPO}/blob/main/${p}`

export default function HowItWorks() {
  return (
    <div className="grain">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <PageHead label="how it works" title="Three hooks and a checksum">
        <p>
          Kane Loop is not a framework. It is three shell scripts wired into Claude Code's hook
          system and one SHA-256 manifest. The whole mechanism is 746 lines of shell you can read in
          an afternoon, and the interesting part is not the plumbing — it is which failure each
          piece is there to prevent.
        </p>
      </PageHead>

      <main id="main" className="mx-auto max-w-[1400px] px-5 pb-24 lg:px-10">
        <section className="border-t border-[color:var(--color-line)] py-[clamp(3rem,7vh,5rem)]">
          <p className="label">01 · PreToolUse</p>
          <h2 className="display mt-3 text-[clamp(1.6rem,3.4vw,2.8rem)]">
            Close the cheapest exit first
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
            <div className="space-y-5 text-[15.5px] leading-[1.7] text-[color:var(--color-dim)]">
              <p>
                If an agent is stuck on a failing test, the cheapest way to make it pass is to
                weaken the test. That is not a hypothetical failure mode — it is the one
                ImpossibleBench was built to measure, and it finds frontier models taking it on the
                majority of tasks where honest success is impossible.
              </p>
              <p>
                So the first hook runs <em>before</em> the write and refuses it. The demo agent may
                edit exactly one thing:{' '}
                <span className="data text-[color:var(--color-ice)]">target-app/src/**</span>. The
                flows, their cached recordings, the hook scripts and the gate's own state files are
                all denied.
              </p>
              <p>
                The Bash branch is default-deny with a read-only verb allowlist, because a shell is
                a write primitive wearing a disguise — <span className="data">rm</span>,{' '}
                <span className="data">mv</span>, <span className="data">tee</span>,{' '}
                <span className="data">sed -i</span>, a redirect, a heredoc. Fourteen separate
                bypasses were found and closed by audit.
              </p>
            </div>
            <Code source=".claude/hooks/kane-guard.sh" href={blob('.claude/hooks/kane-guard.sh')}>
{`# The message the agent actually receives. It names the
# rule, refuses the workaround, and points at the fix.
deny "Kane's test flows are immutable ground truth —
they are the only reason a green means anything, so
the loop will not let you edit them. If the flow looks
wrong, say so in your reply and stop; do not work
around it. Otherwise fix the application code in
target-app/src and save, and Kane will re-run."`}
            </Code>
          </div>
        </section>

        <section className="border-t border-[color:var(--color-line)] py-[clamp(3rem,7vh,5rem)]">
          <p className="label">02 · PostToolUse</p>
          <h2 className="display mt-3 text-[clamp(1.6rem,3.4vw,2.8rem)]">
            The failure returns itself
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
            <div className="space-y-5 text-[15.5px] leading-[1.7] text-[color:var(--color-dim)]">
              <p>
                The instant the agent saves a file in{' '}
                <span className="data text-[color:var(--color-ice)]">target-app/src</span>, this hook
                runs the Kane suite against the live app in a real Chrome — and returns the failure
                as <span className="data text-[color:var(--color-ice)]">additionalContext</span>.
              </p>
              <p>
                That field is the whole trick. Claude Code wraps it in a system reminder and inserts
                it at the point the hook fired, so the agent reads the verdict on its very next model
                request. Nobody pastes an error. Nobody types "it's still broken". The loop closes
                with no human in it.
              </p>
              <p>
                It also hands over the path to Kane's screenshot of the step that failed, because the
                agent can open PNGs and a picture of the rendered page beats one line of prose. The
                run is scoped to app source only, locked so parallel edits cannot stack Chrome
                sessions, and capped well under the 10,000-character context limit.
              </p>
            </div>
            <Code source=".claude/hooks/kane-verify.sh" href={blob('.claude/hooks/kane-verify.sh')}>
{`jq -nc --arg ctx "$MSG" \\
  '{hookSpecificOutput:{
      hookEventName:"PostToolUse",
      additionalContext:$ctx}}'

# $MSG, when Kane is red:
#   KANE VERIFICATION FAILED after your last edit.
#   failed assertion: the page background is still dark
#   (assertion_failed: @ step 2)
#   ...
#   Kane's screenshot of the failing step is at
#   <path> — open it with Read to see exactly what
#   the browser rendered.`}
            </Code>
          </div>
        </section>

        <section className="border-t border-[color:var(--color-line)] py-[clamp(3rem,7vh,5rem)]">
          <p className="label">03 · Stop</p>
          <h2 className="display mt-3 text-[clamp(1.6rem,3.4vw,2.8rem)]">
            Bounded by a counter, not by a flag
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
            <div className="space-y-5 text-[15.5px] leading-[1.7] text-[color:var(--color-dim)]">
              <p>
                PostToolUse gives fast feedback. The Stop gate is the guarantee: even if a verify run
                was skipped — lock held, file out of scope, Kane timed out — the agent physically
                cannot finish on a broken app.
              </p>
              <p>
                The obvious way to stop a Stop hook looping forever is to release when{' '}
                <span className="data text-[color:var(--color-ice)]">stop_hook_active</span> is true.
                This hook used to do that, and it was wrong in a way that quietly falsified the whole
                feature: that flag is true on every stop attempt after the first block, so the gate
                blocked <em>exactly once</em> and the agent could finish red on its second try.
              </p>
              <p>
                A strictly-increasing counter capped at four gives the same protection against an
                infinite loop while letting the gate actually hold. On the fourth block it releases
                and hands off to a human rather than fighting forever — an agent trapped against a
                gate it cannot satisfy is a worse outcome than a human looking at it.
              </p>
            </div>
            <Code source=".claude/hooks/kane-gate.sh" href={blob('.claude/hooks/kane-gate.sh')}>
{`jq -nc --arg r "$REASON" \\
  '{decision:"block",reason:$r,
    hookSpecificOutput:{
      hookEventName:"Stop",
      permissionDecision:"deny",
      permissionDecisionReason:$r}}'
printf '%s\\n' "$REASON" >&2
exit 2

# Three channels, because which one a given Claude
# Code build honours has changed between versions.`}
            </Code>
          </div>
        </section>

        <section className="border-t border-[color:var(--color-line)] py-[clamp(3rem,7vh,5rem)]">
          <p className="label">the oracle</p>
          <h2 className="display mt-3 max-w-[18ch] text-[clamp(1.6rem,3.4vw,2.8rem)]">
            An agent can escape the gate. It cannot forge a pass.
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
            <div className="space-y-5 text-[15.5px] leading-[1.7] text-[color:var(--color-dim)]">
              <p>
                A guard that runs in the same process as the thing it guards is a fence, not a proof.
                So there is a second layer: a SHA-256 manifest taken over every{' '}
                <span className="data text-[color:var(--color-ice)]">*_test.md</span> flow and its{' '}
                <span className="data text-[color:var(--color-ice)]">actions.ndjson</span> recording,
                sealed on the first verified save of a session.
              </p>
              <p>
                Sealing on the first save rather than at the gate matters: the gate runs last, so a
                seal taken there would be taken <em>after</em> any tampering and would happily
                certify it.
              </p>
              <p>
                The integrity check runs <em>first</em>, above every infrastructure precondition.
                It used to sit below them, which made the gate defeatable with one command —{' '}
                <span className="data text-[color:var(--color-ice)]">rm -rf tests</span> emptied the
                suite, the empty-suite branch released, and the oracle was never consulted. Deleting
                the flows now moves the manifest, so it lands on the checksum and blocks.
              </p>
              <p className="border-l-2 border-[color:var(--color-fail)] pl-4">
                <strong className="text-[color:var(--color-ice)]">The honest limit.</strong> The
                manifest covers the flows and their recordings — not the hook scripts, and not the
                gate's own state files. A shell that reaches those turns the detector off rather than
                tripping it. What survives is the claim that matters: the agent can escape the gate,
                but it cannot produce a green that never happened.
              </p>
            </div>
            <Code source=".claude/hooks/kane-lib.sh" href={blob('.claude/hooks/kane-lib.sh')}>
{`oracle_manifest() {
  [ -z "$KANE_HASH_CMD" ] && return 1
  find "$ROOT/tests" -type f \\
    \\( -name '*_test.md' -o -name 'actions.ndjson' \\) \\
    -not -path '*/pending/*' -print0 2>/dev/null \\
    | xargs -0 $KANE_HASH_CMD 2>/dev/null \\
    | LC_ALL=C sort \\
    | $KANE_HASH_CMD 2>/dev/null | awk '{print $1}'
}

# meta.json and execution.json are excluded on purpose:
# Kane rewrites them on every run, so hashing them would
# flag Kane's own normal operation as tampering.`}
            </Code>
          </div>
        </section>

        <section className="border-t border-[color:var(--color-line)] pt-[clamp(3rem,7vh,5rem)]">
          <h2 className="display max-w-[20ch] text-[clamp(1.8rem,4.5vw,3.4rem)]">
            Read all of it — it is short
          </h2>
          <p className="mt-6 max-w-[54ch] text-[15.5px] leading-[1.7] text-[color:var(--color-dim)]">
            Nothing above is paraphrased from documentation. Every snippet is copied out of a file
            in the repository and linked to it.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href={`${REPO}/tree/main/.claude/hooks`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 rounded-lg bg-[color:var(--color-ice)] px-5 py-3 text-[14px] font-semibold text-[color:var(--color-ink)] transition-transform duration-200 hover:-translate-y-0.5"
            >
              The four hook scripts ↗
            </a>
            <a
              href="/evidence"
              className="inline-flex items-center gap-2.5 rounded-lg border border-[color:var(--color-line)] px-5 py-3 text-[14px] font-semibold transition-colors duration-200 hover:border-[color:var(--color-dim)]"
            >
              See it actually run →
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
