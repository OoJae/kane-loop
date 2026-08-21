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
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import cors from "cors";
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

function agentEvent(event: JsonValue): void {
  broadcast({ channel: "agent", event });
}

function startRun(prompt: string): ActiveRun {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--allowedTools",
    ALLOWED_TOOLS,
    "--permission-mode",
    PERMISSION_MODE,
  ];

  const child: AgentProcess = spawn(CLAUDE_BIN, args, {
    cwd: TARGET_APP_DIR,
    env: process.env,
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
      agentEvent({ type: "stderr", text: line });
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
    if (stderrBuffer.trim()) agentEvent({ type: "stderr", text: stderrBuffer });
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
    agentEvent({ type: "stdout_raw", text: trimmed });
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

// POST /run spawns a coding agent with --permission-mode acceptEdits on this
// machine, so the origin check is a security boundary, not a formality:
// reflecting any origin would let any page the user happens to visit start an
// agent that edits their files.
const ALLOWED_ORIGINS = new Set([UI_ORIGIN, `http://127.0.0.1:${WEB_PORT}`]);
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
app.use(express.json({ limit: "1mb" }));

app.use("/evidence", express.static(EVIDENCE_DIR, { fallthrough: true, index: false }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    port: PORT,
    running: activeRun !== null,
    run: activeRun
      ? { id: activeRun.id, prompt: activeRun.prompt, startedAt: activeRun.startedAt }
      : null,
    clients: clients.size,
    uptime: process.uptime(),
    root: ROOT,
    targetApp: TARGET_APP_DIR,
    evidenceDir: EVIDENCE_DIR,
    claudeBin: CLAUDE_BIN,
    events: {
      file: EVENTS_FILE,
      exists: fs.existsSync(EVENTS_FILE),
      offset,
    },
  });
});

app.post("/run", (req, res) => {
  const body: unknown = req.body;
  const prompt =
    typeof body === "object" && body !== null && "prompt" in body
      ? (body as { prompt: unknown }).prompt
      : undefined;

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

app.post("/stop", (_req, res) => {
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

server.listen(PORT, HOST, () => {
  startTailer();
  console.log("");
  console.log(`  Kane Loop orchestrator listening on http://${HOST}:${PORT}`);
  console.log(`  WebSocket           ws://localhost:${PORT}`);
  console.log(`  Tailing             ${EVENTS_FILE}`);
  console.log(`  Agent cwd           ${TARGET_APP_DIR}`);
  console.log(`  Evidence served at  http://localhost:${PORT}/evidence  (${EVIDENCE_DIR})`);
  console.log(`  Claude binary       ${CLAUDE_BIN}`);
  console.log(`  CORS                permissive (UI expected at ${UI_ORIGIN})`);
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
