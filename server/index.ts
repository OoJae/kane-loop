/**
 * Kane Loop orchestrator.
 *
 * One process that makes the closed loop legible to a browser:
 *
 *   POST /run    spawns headless Claude Code inside target-app/ and streams its
 *                stream-json stdout to every WebSocket client as {channel:"agent"}
 *   POST /stop   kills the in-flight agent
 *   GET  /health liveness + whether a run is in flight
 *   /evidence    static Kane artifacts (videos, .evidence packs)
 *   WS  :4000    replay of the last ~2000 loop events, then live
 *
 * It also tails `.kane-events.ndjson` at the repo root — the append-only file
 * the hooks write (see docs/event-protocol.md). That file is the contract; the
 * tailer never re-reads it from the top and never re-broadcasts an old line.
 */

import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";

// --- types -------------------------------------------------------------------

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type Channel = "kane" | "agent";

interface OutboundMessage {
  channel: Channel;
  event: JsonValue;
  /** Present (and true) only on the history burst sent at connect time. */
  replay?: true;
}

/** stdio is ["ignore", "pipe", "pipe"]: no stdin, readable stdout/stderr. */
type AgentProcess = ChildProcessByStdio<null, Readable, Readable>;

interface ActiveRun {
  id: string;
  prompt: string;
  startedAt: string;
  child: AgentProcess;
}

// --- paths & config ----------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Repo root — one level up from server/. Overridable for tests. */
const ROOT = path.resolve(process.env.KANE_ROOT ?? path.join(HERE, ".."));

const EVENTS_FILE = path.join(ROOT, ".kane-events.ndjson");
const TARGET_APP_DIR = path.join(ROOT, "target-app");
const EVIDENCE_DIR = path.join(ROOT, "evidence");

const PORT = Number(process.env.PORT ?? 4000);
/** Overridable so the spawn path is testable without burning agent tokens. */
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const UI_ORIGIN = process.env.KANE_UI_ORIGIN ?? "http://localhost:4321";
const WEB_PORT = new URL(UI_ORIGIN).port || "4321";
// Bind loopback only. With no host argument Node listens on 0.0.0.0, which put
// "spawn an AI agent that edits my files" on every network this laptop joins.
const HOST = process.env.KANE_HOST ?? "127.0.0.1";

/**
 * Shared secret for POST /run, required whenever this is reachable off-localhost.
 * Hosted, that endpoint spends real money — every click starts an agent on the
 * operator's Anthropic key and burns Kane credits — and the agent it starts
 * edits files and runs npm. Unauthenticated, it is a wallet with a button on it.
 * Unset locally, so nothing changes for `./scripts/dev.sh`.
 */
const RUN_SECRET = process.env.KANE_RUN_SECRET ?? "";

/**
 * Fail closed when this is reachable off-loopback with no secret.
 *
 * Binding 0.0.0.0 inside a container is mandatory for a published port and says
 * nothing about internet exposure, so "not loopback" alone is not the test — a
 * named opt-out carries the operator's assertion that the bind is private.
 *
 * This disables the gated endpoints, it does NOT exit. A crash loop on a host
 * with restartPolicyMaxRetries would take the landing page, /evidence, /log and
 * every ?replay= link in the README dark, for a variable that affects one
 * button. Availability of the demo surface is worth more than a loud failure.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const ALLOW_UNAUTH_RUN = process.env.KANE_ALLOW_UNAUTHENTICATED_RUN === "1";
const RUN_DISABLED = RUN_SECRET === "" && !LOOPBACK_HOSTS.has(HOST) && !ALLOW_UNAUTH_RUN;

/**
 * A fixed, PUBLIC bound. Deliberately not RUN_SECRET.length — that would be the
 * very length oracle this function exists to remove.
 */
const MAX_KEY_CHARS = 512;

/**
 * Constant-time key comparison.
 *
 * timingSafeEqual throws on unequal-length buffers, so both sides are hashed to
 * a fixed 32 bytes first: the comparison always spans the same byte count and
 * the secret's length is never observable through a branch. The previous code
 * short-circuited on `supplied.length !== RUN_SECRET.length`, directly beneath a
 * comment promising that a mismatch "must not leak length".
 */
function keyMatches(supplied: string): boolean {
  if (RUN_SECRET === "" || supplied.length > MAX_KEY_CHARS) return false;
  const a = createHash("sha256").update(supplied, "utf8").digest();
  const b = createHash("sha256").update(RUN_SECRET, "utf8").digest();
  return timingSafeEqual(a, b);
}

// --- failed-auth rate limiting -----------------------------------------------
//
// Only WRONG keys are counted. A request carrying no key at all is a capability
// probe (the console asks /health whether this instance is gated), not a guess —
// counting those would let ordinary page loads burn a legitimate key-holder's
// budget. Counting only failures also stops an attacker at one address from
// locking the key-holder at another out of their own instance.
const FAIL_WINDOW_MS = 15 * 60_000;
const FAIL_LIMIT = 10;
const BLOCK_BASE_MS = 30_000;
const BLOCK_MAX_MS = 15 * 60_000;
/** Bounded, or the map is itself a memory-growth DoS. */
const MAX_TRACKED_CLIENTS = 10_000;

interface FailRecord {
  failures: number;
  windowStart: number;
  blocks: number;
  blockedUntil: number;
}
const authFailures = new Map<string, FailRecord>();

/** Seconds remaining on a block, or 0 when the caller is free to try. */
function blockedSeconds(id: string, now = Date.now()): number {
  const rec = authFailures.get(id);
  if (!rec || rec.blockedUntil <= now) return 0;
  return Math.ceil((rec.blockedUntil - now) / 1000);
}

function recordAuthFailure(id: string, now = Date.now()): void {
  if (authFailures.size >= MAX_TRACKED_CLIENTS && !authFailures.has(id)) authFailures.clear();
  const rec = authFailures.get(id) ?? { failures: 0, windowStart: now, blocks: 0, blockedUntil: 0 };
  if (now - rec.windowStart > FAIL_WINDOW_MS) {
    rec.failures = 0;
    rec.windowStart = now;
  }
  rec.failures += 1;
  if (rec.failures >= FAIL_LIMIT) {
    rec.blocks += 1;
    rec.blockedUntil = now + Math.min(BLOCK_BASE_MS * 2 ** (rec.blocks - 1), BLOCK_MAX_MS);
    rec.failures = 0;
    rec.windowStart = now;
    console.warn(
      `[auth] ${id} blocked for ${Math.round((rec.blockedUntil - now) / 1000)}s after ${FAIL_LIMIT} bad keys`,
    );
  }
  authFailures.set(id, rec);
}
/** Built UI (web/dist), served by this process so one host serves everything. */
const WEB_DIST = process.env.KANE_WEB_DIST ?? path.join(ROOT, "web", "dist");
const SITE_DIST = process.env.KANE_SITE_DIST ?? path.join(ROOT, "site", "dist");
// One copy of the recordings, mounted at a stable path. Copying them into the
// site's own public/ is what let the hero image and its log drift apart before.
const RECORDINGS_DIR = path.join(ROOT, "web", "public", "recordings");

const REPLAY_LINES = 2000;
/** Cap on how much of the tail we read back for replay. */
const REPLAY_MAX_BYTES = 1_000_000;
/** fs.watch is primary; this is the safety net for missed/coalesced events. */
const POLL_INTERVAL_MS = 750;

const ALLOWED_TOOLS = "Read,Glob,Grep,Edit,Write,MultiEdit,Bash(npm:*)";
const PERMISSION_MODE = "acceptEdits";

// --- websocket fan-out -------------------------------------------------------

const clients = new Set<WebSocket>();

function broadcast(message: OutboundMessage): void {
  if (clients.size === 0) return;
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

function parseJson(line: string): JsonValue | undefined {
  try {
    return JSON.parse(line) as JsonValue;
  } catch {
    return undefined;
  }
}

// --- tailer ------------------------------------------------------------------
//
// State machine over a file that can be appended to, truncated (demo-reset.sh
// does `: > .kane-events.ndjson`), deleted, or not exist yet.

let offset = 0;
let inode: number | null = null;
let decoder = new StringDecoder("utf8");
let pending = "";
let watcher: fs.FSWatcher | null = null;
let dirWatcher: fs.FSWatcher | null = null;
let drainChain: Promise<void> = Promise.resolve();

function resetTailState(newOffset: number): void {
  offset = newOffset;
  decoder = new StringDecoder("utf8");
  pending = "";
}

function attachFileWatcher(): void {
  if (watcher) return;
  try {
    watcher = fs.watch(EVENTS_FILE, () => scheduleDrain());
    watcher.on("error", () => detachFileWatcher());
  } catch {
    // File is gone; the directory watcher and the poll will pick it back up.
    watcher = null;
  }
}

function detachFileWatcher(): void {
  watcher?.close();
  watcher = null;
}

async function drainOnce(): Promise<void> {
  const stat = await fsp.stat(EVENTS_FILE).catch(() => null);

  if (!stat) {
    // Deleted (or never created). Rewind so a fresh file is read from byte 0.
    if (inode !== null) console.log("[kane] event log disappeared; waiting for it to come back");
    inode = null;
    detachFileWatcher();
    resetTailState(0);
    return;
  }

  if (inode === null) {
    inode = stat.ino;
    resetTailState(0);
    attachFileWatcher();
  } else if (stat.ino !== inode) {
    // Recreated: same path, different file.
    console.log("[kane] event log was replaced; re-tailing from byte 0");
    inode = stat.ino;
    detachFileWatcher();
    resetTailState(0);
    attachFileWatcher();
  } else if (stat.size < offset) {
    // Truncated in place (demo-reset.sh).
    console.log("[kane] event log truncated; re-tailing from byte 0");
    resetTailState(0);
  }

  if (stat.size <= offset) return;

  const handle = await fsp.open(EVENTS_FILE, "r").catch(() => null);
  if (!handle) return;

  try {
    const length = stat.size - offset;
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    if (bytesRead <= 0) return;
    offset += bytesRead;
    pending += decoder.write(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }

  const lines = pending.split("\n");
  // The last element is either "" (chunk ended on a newline) or a partial line.
  pending = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const event = parseJson(trimmed);
    if (event === undefined) continue; // unparseable lines are skipped silently
    broadcast({ channel: "kane", event });
  }
}

function scheduleDrain(): void {
  drainChain = drainChain
    .then(drainOnce)
    .catch((err: unknown) => console.error("[kane] tail error:", err));
}

function startTailer(): void {
  const stat = fs.statSync(EVENTS_FILE, { throwIfNoEntry: false });
  if (stat) {
    // Start at EOF: history is delivered by the replay, not by the live stream.
    inode = stat.ino;
    resetTailState(stat.size);
    attachFileWatcher();
    console.log(`[kane] tailing ${EVENTS_FILE} from byte ${stat.size}`);
  } else {
    console.log(`[kane] ${EVENTS_FILE} does not exist yet — waiting for the hooks to create it`);
  }

  // Watching the directory catches creation/replacement of the file itself.
  try {
    dirWatcher = fs.watch(ROOT, (_event, filename) => {
      if (!filename || path.basename(filename.toString()) === path.basename(EVENTS_FILE)) {
        scheduleDrain();
      }
    });
    dirWatcher.on("error", () => {
      dirWatcher?.close();
      dirWatcher = null;
    });
  } catch {
    dirWatcher = null;
  }
}

/** Last ~2000 lines of the log, for a browser that joins mid-run. */
async function readReplayLines(): Promise<JsonValue[]> {
  const stat = await fsp.stat(EVENTS_FILE).catch(() => null);
  if (!stat || stat.size === 0) return [];

  const start = Math.max(0, stat.size - REPLAY_MAX_BYTES);
  const handle = await fsp.open(EVENTS_FILE, "r").catch(() => null);
  if (!handle) return [];

  let text: string;
  try {
    const length = stat.size - start;
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    text = buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }

  const lines = text.split("\n");
  // A windowed read can begin mid-line; that first fragment is not a record.
  if (start > 0) lines.shift();

  const events: JsonValue[] = [];
  for (const line of lines.slice(-REPLAY_LINES)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const event = parseJson(trimmed);
    if (event !== undefined) events.push(event);
  }
  return events;
}

// --- agent runs --------------------------------------------------------------

let activeRun: ActiveRun | null = null;

/**
 * Values that must never leave this process.
 *
 * The live transcript is public by design — spectating is a feature here — but
 * "anyone may watch" is not "anyone may collect credentials". The agent's raw
 * stderr is forwarded verbatim, and one stack trace or `npm config` dump that
 * echoes the environment would publish a provider token to every listener.
 * Built once at startup; short values are ignored because a two-character
 * secret would redact half the transcript.
 */
const SECRETS: string[] = [
  process.env.KANE_RUN_SECRET,
  process.env.ANTHROPIC_AUTH_TOKEN,
  process.env.ANTHROPIC_API_KEY,
  process.env.KANE_ACCESS_KEY,
].filter((v): v is string => typeof v === "string" && v.length >= 8);

/** Replace any known secret with a marker, preserving the surrounding text. */
function redact(text: string): string {
  let out = text;
  for (const secret of SECRETS) out = out.split(secret).join("[redacted]");
  return out;
}

function agentEvent(event: JsonValue): void {
  broadcast({ channel: "agent", event });
}

function startRun(prompt: string): ActiveRun {
  // `-p/--print` is a BOOLEAN flag and the prompt is a positional argument, so a
  // prompt beginning with "-" is parsed as an option instead of as text. That is
  // not cosmetic: `--settings=<inline json>` accepts hooks and executes them, so
  // a leading-dash prompt is arbitrary command execution AND a way to override
  // the very hooks this project is built on. Rejected at the door in POST /run;
  // the "--" here is the second line of defence.
  const args = [
    "--output-format",
    "stream-json",
    "--verbose",
    "--allowedTools",
    ALLOWED_TOOLS,
    "--permission-mode",
    PERMISSION_MODE,
    "-p",
    "--",
    prompt,
  ];

  // The agent holds Write plus Bash(npm:*), and `npm run <script>` executes
  // whatever package.json says — a file it can write. Treat it as having a
  // shell: anything in its environment is exfiltratable. The run key above all,
  // since stealing that turns one abusive run into permanent access.
  //
  // KANE_ACCESS_KEY/KANE_USERNAME go too: scripts/serve.sh runs `kane-cli login`
  // at boot and the hooks use the stored session — .claude/hooks/* read only
  // KANE_TARGET_URL, KANE_FLOW_GLOB and KANE_RUN_TIMEOUT.
  const childEnv = { ...process.env };
  delete childEnv["KANE_RUN_SECRET"];
  delete childEnv["KANE_ACCESS_KEY"];
  delete childEnv["KANE_USERNAME"];

  const child: AgentProcess = spawn(CLAUDE_BIN, args, {
    cwd: TARGET_APP_DIR,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const run: ActiveRun = {
    id: randomUUID(),
    prompt,
    startedAt: new Date().toISOString(),
    child,
  };
  activeRun = run;

  console.log(`[run ${run.id}] ${CLAUDE_BIN} in ${TARGET_APP_DIR} :: ${prompt}`);
  agentEvent({ type: "process_start", run_id: run.id, prompt, cwd: TARGET_APP_DIR });

  // stream-json emits one JSON object per line, but a chunk is not a line:
  // it can split mid-object or carry several objects at once.
  let stdoutBuffer = "";
  const stdoutDecoder = new StringDecoder("utf8");
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuffer += stdoutDecoder.write(chunk);
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) emitAgentLine(line);
  });

  let stderrBuffer = "";
  const stderrDecoder = new StringDecoder("utf8");
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBuffer += stderrDecoder.write(chunk);
    const lines = stderrBuffer.split("\n");
    stderrBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      console.error(`[run ${run.id}] stderr: ${line}`);
      agentEvent({ type: "stderr", text: redact(line) });
    }
  });

  // A failed spawn emits BOTH 'error' and 'close'; the run must end exactly once.
  let exitEmitted = false;
  const emitExit = (code: number | null, signal: NodeJS.Signals | null): void => {
    if (exitEmitted) return;
    exitEmitted = true;
    console.log(`[run ${run.id}] exited code=${code ?? "null"} signal=${signal ?? "none"}`);
    if (activeRun?.id === run.id) activeRun = null;
    agentEvent({ type: "process_exit", code, signal, run_id: run.id });
  };

  child.on("error", (err: Error) => {
    console.error(`[run ${run.id}] spawn failed:`, err.message);
    agentEvent({ type: "process_error", message: err.message, bin: CLAUDE_BIN });
    emitExit(null, null);
  });

  child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
    // Flush whatever did not end with a newline.
    stdoutBuffer += stdoutDecoder.end();
    if (stdoutBuffer.trim()) emitAgentLine(stdoutBuffer);
    stdoutBuffer = "";
    stderrBuffer += stderrDecoder.end();
    if (stderrBuffer.trim()) agentEvent({ type: "stderr", text: redact(stderrBuffer) });
    stderrBuffer = "";

    emitExit(code, signal);
  });

  return run;
}

function emitAgentLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  const event = parseJson(trimmed);
  if (event === undefined) {
    // Not stream-json (a banner, a warning). Forward it rather than lose it.
    agentEvent({ type: "stdout_raw", text: redact(trimmed) });
    return;
  }
  agentEvent(event);
}

function stopRun(): { stopped: boolean; runId: string | null } {
  const run = activeRun;
  if (!run) return { stopped: false, runId: null };

  console.log(`[run ${run.id}] stopping`);
  run.child.kill("SIGTERM");
  const child = run.child;
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 3000).unref();

  return { stopped: true, runId: run.id };
}

// --- http --------------------------------------------------------------------

const app = express();

// Exactly one hop, and only behind a known proxy. `true` would trust a
// client-supplied X-Forwarded-For, letting an attacker mint a fresh rate-limit
// bucket per request — that does not weaken the limiter, it deletes it. Enabling
// it with no proxy in front is worse than nothing for the same reason.
if (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.KANE_TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

/**
 * The one gate. /run, /diag and /stop share it so they cannot drift apart —
 * before this, /run and /diag returned different 401 bodies for the same
 * condition, which told an attacker which endpoint they had reached.
 *
 * Every branch is a no-op when RUN_SECRET is unset, so `./scripts/dev.sh` is
 * completely unaffected.
 */
function requireKey(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (RUN_DISABLED) {
    res.status(503).json({
      ok: false,
      error:
        "This endpoint is disabled: the server is reachable off-loopback with no KANE_RUN_SECRET set. " +
        "Set one, or set KANE_ALLOW_UNAUTHENTICATED_RUN=1 if this bind really is private.",
    });
    return;
  }
  if (RUN_SECRET === "") {
    next();
    return;
  }

  const id = req.ip ?? "unknown";
  const wait = blockedSeconds(id);
  if (wait > 0) {
    res.setHeader("Retry-After", String(wait));
    res.status(429).json({ ok: false, error: `too many bad keys — retry in ${wait}s` });
    return;
  }

  const supplied = req.get("x-kane-key") ?? "";
  if (keyMatches(supplied)) {
    next();
    return;
  }

  // Only a WRONG key counts against the limit. No key at all is a probe.
  if (supplied !== "") recordAuthFailure(id);
  res.status(401).json({
    ok: false,
    error:
      "This instance requires a key. Kane Loop runs locally with one command — see the repo — " +
      "or use the key supplied with the submission.",
  });
}

// POST /run spawns a coding agent with --permission-mode acceptEdits on this
// machine, so the origin check is a security boundary, not a formality:
// reflecting any origin would let any page the user happens to visit start an
// agent that edits their files.
const ALLOWED_ORIGINS = new Set(
  [
    UI_ORIGIN,
    `http://127.0.0.1:${WEB_PORT}`,
    // When the UI is served by this same process there is one origin, and it is
    // whatever the host assigned.
    process.env.KANE_PUBLIC_ORIGIN ?? "",
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "",
  ].filter((o) => o !== ""),
);
app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = curl, the tests, same-origin. Browsers always send one.
      // Returning false (rather than an Error) omits the CORS headers instead of
      // producing a 500 with a stack trace.
      cb(null, !origin || ALLOWED_ORIGINS.has(origin));
    },
    credentials: true,
  }),
);

// Explicit rejection, not just absent CORS headers. The loopback bind stops the
// LAN, but DNS rebinding can still point a hostname at 127.0.0.1 and get a
// browser to talk to us — at which point the Origin header is what gives it away.
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.status(403).json({ error: `origin not allowed: ${origin}` });
    return;
  }
  next();
});
// 64kb, not 1mb: a prompt is text, and this body is parsed before the key is
// ever checked.
app.use(express.json({ limit: "64kb" }));

// redirect:false matters: express.static answers a bare directory with a 301 to
// its trailing-slash form, which meant `/evidence` — the landing site's receipts
// page — was swallowed by the evidence FILE mount before routing ever saw it.
// With it off, `/evidence` falls through to the SPA and `/evidence/ui/x.ndjson`
// still serves the file.
app.use(
  "/evidence",
  express.static(EVIDENCE_DIR, { fallthrough: true, index: false, redirect: false }),
);

/**
 * Public, unauthenticated — it is the platform healthcheck, so it must stay
 * reachable. Everything it used to report about the container (port, binary
 * path, directory names, client count) was fingerprinting with no consumer:
 * nothing in web/ ever read this. `run.prompt` was worse — arbitrary
 * key-holder-authored text on a public endpoint.
 *
 * `keyRequired` is safe to publish and saves the console from inferring the
 * answer from a build-time env var, which is the exact class of bug that made
 * the Run button unusable. It reveals nothing a single request would not:
 * POST /run with {} already answers it, since auth runs before body validation.
 */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    running: activeRun !== null,
    uptime: process.uptime(),
    keyRequired: RUN_SECRET !== "",
    runDisabled: RUN_DISABLED,
    events: {
      // basename: the comment this replaces claimed absolute paths had been
      // stripped, but this one was missed and still leaked the container path.
      file: path.basename(EVENTS_FILE),
      exists: fs.existsSync(EVENTS_FILE),
      offset,
    },
  });
});

// The only endpoint that spends money: it starts an agent on the operator's
// model credits, burns Kane credits, and edits files. requireKey covers the
// comparison, the rate limit and the off-loopback fail-closed.
app.post("/run", requireKey, (req, res) => {
  const body: unknown = req.body;
  const prompt =
    typeof body === "object" && body !== null && "prompt" in body
      ? (body as { prompt: unknown }).prompt
      : undefined;

  if (typeof prompt === "string" && prompt.trim().startsWith("-")) {
    // See startRun: a leading dash turns the prompt into a CLI flag, and
    // `--settings=<json>` would execute hooks of the caller's choosing.
    res.status(400).json({
      ok: false,
      error: "prompt may not start with '-' (it would be parsed as a CLI flag)",
    });
    return;
  }
  if (typeof prompt !== "string" || prompt.trim() === "") {
    res.status(400).json({ ok: false, error: "body must be { prompt: string }" });
    return;
  }

  if (activeRun) {
    res.status(409).json({
      ok: false,
      error: "a run is already in flight",
      run: { id: activeRun.id, prompt: activeRun.prompt, startedAt: activeRun.startedAt },
    });
    return;
  }

  const run = startRun(prompt.trim());
  // 202: accepted and streaming. The verdict arrives over the WebSocket.
  res.status(202).json({
    ok: true,
    runId: run.id,
    prompt: run.prompt,
    startedAt: run.startedAt,
    cwd: TARGET_APP_DIR,
  });
});

/**
 * Tail of Kane's stderr, behind the same key as /run. A hosted container has no
 * shell for the operator, and "exit 2, see .kane-stderr.log" is useless advice
 * when the file is inside a container you cannot open.
 */
// Also the console's key validator: it is the same gate as /run, but free —
// no credits, no side effects — so a pasted key can be checked before it is
// ever used to start a run.
app.get("/diag", requireKey, (_req, res) => {
  const file = path.join(ROOT, ".kane-stderr.log");
  let stderrTail = "";
  try {
    const buf = fs.readFileSync(file, "utf8");
    stderrTail = buf.slice(-4000);
  } catch {
    stderrTail = "(no .kane-stderr.log yet)";
  }
  res.json({ ok: true, stderrTail });
});

/**
 * Serve one of Kane's step screenshots.
 *
 * Kane writes them under ~/.testmuai/…/replay-test/screenshots/, outside the
 * repo, so the UI cannot reach them without help. The path arrives from the
 * event log rather than from a user, but it is still untrusted input on a
 * public deployment: resolve it, then require it to sit inside one of two
 * roots, and serve only image files.
 */
// Resolved through symlinks at startup, so containment is compared like for
// like — on macOS /var is itself a symlink to /private/var, which would
// otherwise make a legitimate path look like an escape.
const SHOT_ROOTS = [path.join(os.homedir(), ".testmuai"), EVIDENCE_DIR].map((root) => {
  try {
    return fs.realpathSync(root);
  } catch {
    return root;
  }
});

app.get("/shot", (req, res) => {
  const raw = typeof req.query["p"] === "string" ? req.query["p"] : "";
  if (raw === "") {
    res.status(400).json({ ok: false, error: "p is required" });
    return;
  }

  // Resolve symlinks before judging. path.resolve alone only neutralises "..",
  // and once the agent is running it can create links: `ln -s /etc/passwd
  // ~/.testmuai/x.png` passes both a prefix check and an extension test done on
  // the link's own name. Both tests below run on the real target.
  let resolved: string;
  try {
    resolved = fs.realpathSync(path.resolve(raw));
  } catch {
    res.status(404).json({ ok: false, error: "no such screenshot" });
    return;
  }

  const inside = SHOT_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!inside) {
    res.status(403).json({ ok: false, error: "path is outside the allowed roots" });
    return;
  }
  if (!/\.(png|jpe?g|webp)$/i.test(resolved)) {
    res.status(403).json({ ok: false, error: "not an image" });
    return;
  }

  // Immutable: a given run's screenshot never changes once written.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(resolved);
});

/**
 * Put the demo back to its seeded, broken state.
 *
 * A hosted demo of a closed loop is single-use without this: the first visitor
 * who closes the loop leaves the bug FIXED, and everyone after them opens an app
 * that already works and proves nothing. Judges need to be able to run it more
 * than once.
 *
 * Deliberately does not shell out to scripts/demo-reset.sh — that script leans on
 * `git checkout`, and the container's tree is not a working copy worth trusting
 * for this. The seed file is the source of truth, exactly as that script argues.
 */
app.post("/reset", requireKey, (_req, res) => {
  if (activeRun) {
    res.status(409).json({ ok: false, error: "a run is in flight — stop it before resetting" });
    return;
  }
  const seed = path.join(TARGET_APP_DIR, ".seed", "App.tsx");
  const live = path.join(TARGET_APP_DIR, "src", "App.tsx");
  try {
    const buggy = fs.readFileSync(seed, "utf8");
    // Never restore a "seed" that is quietly the fixed version — that would hand
    // the next visitor a green demo and call it a reset.
    if (buggy.includes("localStorage")) {
      res.status(500).json({ ok: false, error: "seed is not the buggy version; refusing to reset" });
      return;
    }
    fs.writeFileSync(live, buggy);
    fs.writeFileSync(EVENTS_FILE, "");
    offset = 0;
    for (const f of [".kane.lock", ".kane-failcount", ".kane-stderr.log", ".kane-oracle.sha256"]) {
      fs.rmSync(path.join(ROOT, f), { force: true, recursive: true });
    }
    console.log("[reset] demo re-seeded");
    res.json({ ok: true, reseeded: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: `reset failed: ${(err as Error).message}` });
  }
});

// Gated. Unauthenticated, this was a free and unlimited way to destroy evidence
// mid-run, leave target-app/src half-written with no verdict, and guarantee the
// hosted demo never closes a loop. Scoping by runId instead was rejected: the id
// is broadcast to every WebSocket client, so it is not a secret.
app.post("/stop", requireKey, (_req, res) => {
  const result = stopRun();
  res.json({ ok: true, ...result });
});

const server = http.createServer(app);
// CORS does not apply to WebSockets — the browser will happily open one to a
// different origin. Without this check, any page could read the live agent
// transcript and Kane verdicts off this machine.
const wss = new WebSocketServer({
  server,
  verifyClient({ origin }, done) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return done(true);
    done(false, 403, "origin not allowed");
  },
});

wss.on("connection", (socket: WebSocket) => {
  clients.add(socket);
  console.log(`[ws] client connected (${clients.size} total)`);

  socket.on("close", () => {
    clients.delete(socket);
    console.log(`[ws] client disconnected (${clients.size} total)`);
  });
  socket.on("error", () => clients.delete(socket));

  void readReplayLines()
    .then((events) => {
      if (socket.readyState !== socket.OPEN) return;
      for (const event of events) {
        const message: OutboundMessage = { channel: "kane", event, replay: true };
        socket.send(JSON.stringify(message));
      }
      if (events.length > 0) console.log(`[ws] replayed ${events.length} kane events`);
    })
    .catch((err: unknown) => console.error("[ws] replay failed:", err));
});

// --- lifecycle ---------------------------------------------------------------

const poll = setInterval(scheduleDrain, POLL_INTERVAL_MS);
poll.unref();

// Hosted, the target app runs inside this container on 5173 and is not reachable
// from outside, so the iframe would show nothing. Proxy it under /app — ws:true
// because Vite's HMR socket lives on the same path, and without it the app in
// the iframe would never pick up the agent's edits.
const TARGET_ORIGIN = process.env.KANE_TARGET_URL ?? "http://127.0.0.1:5173";
// /app is the iframe's entry point. The rest are Vite's own dev paths, which the
// app's HTML requests ROOT-absolute (/@vite/client, /src/main.tsx): served from
// this origin they hit the SPA fallback and the iframe renders blank white.
// None of them collide with the built UI, which lives under /assets.
// ws is OFF on both proxies, and that is load-bearing. With ws:true they attach
// greedy `upgrade` handlers to this same HTTP server, so the UI's OWN WebSocket
// got piped into Vite, which died on the unrecognised frames:
//   RangeError: Invalid WebSocket frame: invalid status code 26274
// taking the whole target app down with it. The cost is no hot-reload inside the
// iframe on the hosted instance — which costs nothing here, because the Kane
// flow reloads the page itself and the pane has a Reload button.
app.use("/app", createProxyMiddleware({ target: TARGET_ORIGIN, changeOrigin: true, ws: false }));

// An explicit prefix test rather than pathFilter globs: those silently failed to
// match, so every module request fell through to the SPA fallback and the
// browser refused the reply ("Expected a JavaScript-or-Wasm module script but
// the server responded with a MIME type of text/html"). Mounting with app.use
// would strip the prefix Vite needs, so this leaves req.url untouched.
const VITE_PREFIXES = ["/@vite", "/@react-refresh", "/@fs", "/@id", "/src/", "/node_modules/"];
const viteAssetProxy = createProxyMiddleware({
  target: TARGET_ORIGIN,
  changeOrigin: true,
  ws: false,
});
app.use((req, res, next) => {
  if (VITE_PREFIXES.some((prefix) => req.url.startsWith(prefix))) {
    viteAssetProxy(req, res, next);
    return;
  }
  next();
});

// Serve the built UI from this process when it exists, so a hosted deployment is
// a single origin and a single service rather than three.
//
// Order matters and is not arbitrary:
//   /recordings  one copy, read by both the console and the landing page
//   /console     the orchestrator UI, plus its own SPA fallback
//   /            the landing site, whose fallback must exclude everything above
// The Vite passthrough above still runs first, which is why the landing site can
// never own a /src/ path — its built assets go to /assets, so this costs nothing.
if (fs.existsSync(RECORDINGS_DIR)) {
  app.use("/recordings", express.static(RECORDINGS_DIR, { fallthrough: true, index: false }));
}

if (fs.existsSync(WEB_DIST)) {
  app.use("/console", express.static(WEB_DIST, { index: "index.html" }));
  app.get(/^\/console(\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, "index.html"));
  });
}

// The landing site's own routes. Listing them lets an unknown path answer with
// a real 404 status instead of 200-and-a-page-that-says-404, which is the usual
// SPA compromise and a slightly embarrassing one for this project specifically.
const SITE_ROUTES = new Set(["/", "/how-it-works", "/evidence", "/log"]);

if (fs.existsSync(SITE_DIST)) {
  app.use(express.static(SITE_DIST, { index: "index.html" }));
  app.get(/^\/(?!run$|stop$|health$|diag$|shot$|console|recordings\/|evidence\/|app\/?).*/, (req, res) => {
    const route = req.path.replace(/\/+$/, "") || "/";
    if (!SITE_ROUTES.has(route)) res.status(404);
    res.sendFile(path.join(SITE_DIST, "index.html"));
  });
} else if (fs.existsSync(WEB_DIST)) {
  // No landing site built — fall back to the console at the root so a bare
  // `npm run build && npm start` still gives you a working UI.
  app.use(express.static(WEB_DIST, { index: "index.html" }));
  app.get(/^\/(?!run$|stop$|health$|diag$|shot$|recordings\/|evidence\/|app\/?).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, "index.html"));
  });
}

/**
 * Registered last, so it sits below every route including the SPA fallbacks.
 *
 * Without it, a malformed body or an oversized one falls through to Express's
 * default handler and returns an HTML page — which the console now parses as
 * JSON on its 401 and 429 paths. Arity 4 is what marks this as an error
 * handler, so `_next` has to stay in the signature even though it is unused.
 */
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ): void => {
    const status =
      typeof (err as { status?: number } | null)?.status === "number"
        ? (err as { status: number }).status
        : 400;
    console.error("[http]", err);
    res
      .status(status)
      .json({ ok: false, error: status === 413 ? "body too large" : "malformed request" });
  },
);

server.listen(PORT, HOST, () => {
  startTailer();
  console.log("");
  console.log(`  Kane Loop orchestrator listening on http://${HOST}:${PORT}`);
  console.log(`  WebSocket           ws://localhost:${PORT}`);
  console.log(`  Tailing             ${EVENTS_FILE}`);
  console.log(`  Agent cwd           ${TARGET_APP_DIR}`);
  console.log(`  Evidence served at  http://localhost:${PORT}/evidence  (${EVIDENCE_DIR})`);
  console.log(`  Claude binary       ${CLAUDE_BIN}`);
  console.log(`  CORS                restricted to ${[...ALLOWED_ORIGINS].join(", ")}`);

  // Say plainly which of the three postures this process is in. The dangerous
  // one used to be silent.
  if (RUN_DISABLED) {
    console.log(
      "  \x1b[1;31m/run, /stop and /diag are DISABLED\x1b[0m — bound to " +
        `${HOST} with no KANE_RUN_SECRET. Set one, or KANE_ALLOW_UNAUTHENTICATED_RUN=1.`,
    );
  } else if (RUN_SECRET === "") {
    console.log("  Run gate            open (no KANE_RUN_SECRET; loopback only)");
  } else {
    console.log("  Run gate            key required");
    if (RUN_SECRET.length < 24) {
      console.log(
        "  \x1b[1;33m!\x1b[0m KANE_RUN_SECRET is short. Rate limiting only buys time —" +
          " entropy is what makes guessing infeasible. Try: openssl rand -base64 32",
      );
    }
  }
  console.log("");
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[shutdown] ${signal} — closing down`);

  clearInterval(poll);
  detachFileWatcher();
  dirWatcher?.close();

  if (activeRun) {
    activeRun.child.kill("SIGTERM");
    const child = activeRun.child;
    setTimeout(() => child.kill("SIGKILL"), 2000).unref();
  }

  for (const client of clients) client.close(1001, "server shutting down");
  wss.close();
  server.close(() => process.exit(0));

  // Do not hang the demo on a lingering socket.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
