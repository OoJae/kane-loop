/**
 * The one true parse of Kane CLI v0.8.4 `--agent` NDJSON.
 *
 * Pure: string in, verdict out. No I/O, no spawning — so it can be proved
 * against real captured runs (evidence/red/RED.ndjson, evidence/green/GREEN.ndjson)
 * without spending a single credit.
 *
 * Every rule here is a hard-won fact from docs/tool-surface.md §"Findings from
 * real runs", not from Kane's published docs — which are wrong on three counts.
 */

export type KaneStatus = "passed" | "failed" | "error" | "timeout";

export interface KaneVerdict {
  status: KaneStatus;
  summary: string;
  one_liner: string;
  reason: string;
  credits: number;
  duration: number | null;
  run_dir: string;
  test_url: string;
  evidence: Record<string, unknown>;
}

type Ev = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Ev => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Ev) : {});
const typeOf = (e: Ev): string => str(e["type"]);

/** Progress events carry no `type` field at all, and step prose can contain any
 *  substring — so line-oriented JSON.parse is the only safe reader. */
export function parseEvents(stdout: string): Ev[] {
  const events: Ev[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === "object") events.push(parsed as Ev);
    } catch {
      /* truncated final line on a killed run */
    }
  }
  return events;
}

/** Exit code is authoritative: 0 pass / 1 fail / 2 error / 3 timeout. */
function fromExit(code: number | null): KaneStatus | null {
  switch (code) {
    case 0: return "passed";
    case 1: return "failed";
    case 2: return "error";
    case 3: return "timeout";
    case null: return null;
    default: return "error";
  }
}

export function parseKaneNdjson(stdout: string, exitCode: number | null): KaneVerdict {
  const events = parseEvents(stdout);
  const runEnds = events.filter((e) => typeOf(e) === "run_end");

  // FACT 1: a testmd run emits one `run_end` PER STEP, not one per file.
  // `tail -1` reports only the last step and silently misses an earlier failure.
  const chosen = runEnds.find((e) => str(e["status"]) !== "passed") ?? runEnds[runEnds.length - 1];

  const summaryEv = events.filter((e) => typeOf(e) === "test_md_summary").pop();
  const doneEv = events.filter((e) => typeOf(e) === "test_md_done").pop();
  const ingestEv = events.filter((e) => typeOf(e) === "test_md_evidence_ingest").pop();
  const bugEv = events.filter((e) => typeOf(e) === "test_md_bug_verdict").pop();

  // FACT 2: the field is `credits_consumed` (float, per step), never `credits`.
  // Observed in the wild nested under `run_end.verdict`; read both, sum the run.
  const credits = runEnds.reduce(
    (sum, e) =>
      sum +
      (num(e["credits_consumed"]) ?? num(obj(e["verdict"])["credits_consumed"]) ?? num(e["credits"]) ?? 0),
    0
  );

  // FACT 3: prefer `test_md_summary.overall_status` as the file-level verdict.
  const overall = str(summaryEv?.["overall_status"]) || str(doneEv?.["overall_status"]);

  // Never report a pass when Kane produced no verdict at all (auth failure,
  // crash, no such test). Silence is not success.
  if (chosen === undefined && overall === "") {
    return {
      status: "error",
      summary: "Kane produced no verdict.",
      one_liner: "",
      reason:
        `Kane emitted no run_end and no test_md_summary (exit ${exitCode ?? "unknown"}). ` +
        "The run did not reach a verdict — treat this as UNVERIFIED, not as a pass.",
      credits,
      duration: null,
      run_dir: "",
      test_url: "",
      evidence: { events_seen: events.length, exit_code: exitCode },
    };
  }

  const dataStatus: KaneStatus =
    overall !== ""
      ? overall === "passed" ? "passed" : "failed"
      : str(chosen?.["status"]) === "passed" ? "passed" : "failed";

  // exitCode === null means the process was killed by a signal, so there is no
  // verdict to trust. Falling through to the data is only safe when the run
  // actually reached a file-level summary; a stream cut off mid-run whose last
  // per-step run_end happened to pass would otherwise be reported as "passed".
  let status = fromExit(exitCode) ?? (overall !== "" ? dataStatus : "error");
  // A non-passing overall_status or per-step run_end outranks a zero exit code.
  if (status === "passed" && dataStatus !== "passed") status = "failed";
  if (status === "passed" && chosen !== undefined && str(chosen["status"]) !== "passed") status = "failed";

  // Name the step that broke: test_md_step_end(failed) -> matching step_start heading.
  const failedStep = events.find((e) => typeOf(e) === "test_md_step_end" && str(e["status"]) !== "passed");
  const stepIndex = failedStep ? num(failedStep["step_index"]) : null;
  const heading =
    stepIndex === null
      ? ""
      : str(
          events.find((e) => typeOf(e) === "test_md_step_start" && num(e["step_index"]) === stepIndex)?.["heading"]
        );

  // FACT 4: prefer the LITERAL failed assertion from `step_end`. `run_end.summary`
  // and the bug verdict's one_liner editorialise about Kane's own wiring
  // ("this looks like a false automation failure"), which would send the agent
  // debugging the test instead of the app.
  const assertion = str(
    events.find((e) => typeOf(e) === "step_end" && str(e["status"]) === "failed")?.["summary"]
  ).replace(/^assert:\s*/, "");

  const steps = obj(summaryEv?.["steps"]);
  const counted = num(steps["total"]);
  const synthesized =
    counted === null
      ? `Kane reported ${status}.`
      : `${counted} step${counted === 1 ? "" : "s"}: ${num(steps["passed"]) ?? 0} passed, ` +
        `${num(steps["failed"]) ?? 0} failed, ${num(steps["skipped"]) ?? 0} skipped.`;

  const rawReason =
    str(chosen?.["reason"]) || str(chosen?.["one_liner"]) || str(obj(chosen?.["verdict"])["one_liner"]) ||
    "no reason reported";

  let reason: string;
  if (status === "passed") {
    reason = rawReason;
  } else {
    reason = assertion ? `failed assertion: "${assertion}" (${rawReason})` : rawReason;
    if (heading !== "") reason = `step "${heading}" ${status} — ${reason}`;
  }

  return {
    status,
    summary: str(chosen?.["summary"]) || synthesized,
    one_liner: str(chosen?.["one_liner"]) || str(obj(chosen?.["verdict"])["one_liner"]),
    reason,
    credits: Number(credits.toFixed(4)),
    duration:
      num(summaryEv?.["duration_s"]) ??
      num(doneEv?.["duration_s"]) ??
      (runEnds.length > 0 ? runEnds.reduce((s, e) => s + (num(e["duration"]) ?? 0), 0) : null),
    run_dir: str(chosen?.["run_dir"]),
    test_url: str(chosen?.["test_url"]) || str(chosen?.["final_url"]),
    evidence: {
      session_id: str(doneEv?.["session_id"]),
      evidence_id: str(ingestEv?.["evidence_id"]),
      screenshot: str(chosen?.["screenshot_path"]),
      steps: summaryEv ? steps : null,
      run_end_count: runEnds.length,
      failed_step: stepIndex === null ? null : { index: stepIndex, heading, assertion },
      // Kane's own opinion, quarantined here so it can never masquerade as the
      // reason the agent acts on.
      kane_bug_note: bugEv ? str(bugEv["one_liner"]) : "",
      exit_code: exitCode,
    },
  };
}
