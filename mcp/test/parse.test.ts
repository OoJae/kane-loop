/**
 * Proves the parser against REAL captured Kane output — no credits spent,
 * no stubs. RED.ndjson is a real failing run (exit 1), GREEN.ndjson a real
 * passing one (exit 0), both from evidence/.
 *
 * Each case is checked twice: once with the authoritative process exit code,
 * and once with exitCode=null to prove the NDJSON alone yields the same verdict.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKaneNdjson, type KaneStatus } from "../src/parse.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}

interface Case {
  name: string;
  file: string;
  exit: number;
  status: KaneStatus;
  assertion: string;
}

const cases: Case[] = [
  {
    name: "RED  (real failing run)",
    file: "evidence/red/RED.ndjson",
    exit: 1,
    status: "failed",
    assertion: "the page background is still dark",
  },
  {
    name: "GREEN (real passing run)",
    file: "evidence/green/GREEN.ndjson",
    exit: 0,
    status: "passed",
    assertion: "",
  },
];

for (const c of cases) {
  const raw = readFileSync(join(ROOT, c.file), "utf8");
  const v = parseKaneNdjson(raw, c.exit);
  console.log(`\n=== ${c.name} — ${c.file} (exit ${c.exit}) ===`);
  console.log(JSON.stringify(v, null, 2));
  check("status", v.status, c.status);
  check("failed assertion (stripped)", (v.evidence["failed_step"] as { assertion?: string } | null)?.assertion ?? "", c.assertion);
  check("run_end_count (one per STEP, not per file)", v.evidence["run_end_count"], 4);
  check("verdict is data-derived too (exitCode=null)", parseKaneNdjson(raw, null).status, c.status);
}

// A pass must never be invented out of silence.
console.log("\n=== NEGATIVE: no verdict in the stream ===");
const empty = parseKaneNdjson('{"type":"step_event","event":"screenshot"}\nnot json at all\n', 0);
console.log(JSON.stringify({ status: empty.status, reason: empty.reason }, null, 2));
check("empty stream is NOT reported as passed", empty.status, "error");

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
