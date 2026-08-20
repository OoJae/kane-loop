import { useCallback, useState } from 'react'
import { isHttpUrl, shortenPath } from '../lib/format'
import { EVIDENCE_BASE } from '../lib/config'
import type { Evidence } from '../lib/store'

/**
 * The orchestrator serves the repo's `evidence/` directory statically, so a
 * repo-relative run_dir becomes a clickable link; absolute Kane session paths
 * stay copy-to-clipboard.
 */
function browsableUrl(value: string): string | null {
  const match = /(?:^|\/)evidence\/(.+)$/.exec(value.replace(/\\/g, '/'))
  return match ? `${EVIDENCE_BASE}/${match[1]}` : null
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      })
      .catch(() => undefined)
  }, [value])

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-dim uppercase transition-colors hover:border-accent/60 hover:text-accent"
      title="Copy to clipboard"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

/** Latest `flow_end.run_dir` / `flow_end.test_url` — the receipts a judge can open. */
export function EvidenceStrip({
  evidence,
  creditsTotal,
}: {
  evidence: Evidence | null
  creditsTotal: number
}) {
  return (
    <section className="shrink-0">
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="font-mono text-[10.5px] font-bold tracking-[0.18em] text-dim uppercase">
          Evidence
        </h3>
        <span className="h-px flex-1 bg-line-soft" />
        <span className="font-mono text-[10.5px] text-dim tabular-nums">
          {creditsTotal} credits this session
        </span>
      </div>

      {!evidence ? (
        <p className="rounded-xl border border-dashed border-line-soft px-3 py-2.5 text-[12px] text-dim">
          Evidence links appear with the first verdict.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-xl border border-line-soft bg-panel-2/70 px-2.5 py-2">
          <Row label="run_dir" value={evidence.runDir} />
          <Row label="test_url" value={evidence.testUrl} />
        </div>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[62px] shrink-0 font-mono text-[10.5px] font-bold text-dim">
        {label}
      </span>
      {value ? (
        isHttpUrl(value) ? (
          <>
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate font-mono text-[12px] text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            >
              {value.replace(/^https?:\/\//, '')}
            </a>
            <span className="shrink-0 text-[11px] text-accent">↗</span>
          </>
        ) : (
          <>
            {browsableUrl(value) ? (
              <a
                href={browsableUrl(value) as string}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate font-mono text-[12px] text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                title={value}
              >
                {shortenPath(value, 3)}
              </a>
            ) : (
              <code
                className="min-w-0 flex-1 truncate font-mono text-[12px] text-ice"
                title={value}
              >
                {shortenPath(value, 3)}
              </code>
            )}
            <CopyButton value={value} />
          </>
        )
      ) : (
        <span className="flex-1 font-mono text-[12px] text-dim">—</span>
      )}
    </div>
  )
}
