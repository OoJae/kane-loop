#!/usr/bin/env node
/**
 * verify_with_kane — an MCP server that gives ANY MCP-capable agent
 * (Claude Code, Cursor, Codex, …) a real browser to check its own work in.
 *
 * Kane CLI ships no MCP server of its own; this fills that gap. Verdicts come
 * from a real Chrome driven by Kane AI — never from a simulation.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseKaneNdjson, type KaneVerdict } from "./parse.js";

const PROJECT_ROOT =
  process.env["KANE_PROJECT_DIR"] ??
  process.env["CLAUDE_PROJECT_DIR"] ??
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const KANE_BIN = process.env["KANE_CLI_BIN"] ?? "kane-cli";

interface RunOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  spawnError: string | null;
}

/** Never uses a shell: this project's path contains a space, and objectives are
 *  free text. Args go across as an array or not at all. */
function runKane(args: string[], timeoutSec: number): Promise<RunOutcome> {
  return new Promise((res) => {
    const child = spawn(KANE_BIN, args, { cwd: PROJECT_ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    // Kane honours --timeout itself; this is the backstop for a wedged process.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, (timeoutSec + 30) * 1000);

    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      res({ code: null, stdout, stderr, spawnError: err.code === "ENOENT" ? "ENOENT" : err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      res({ code: timedOut ? 3 : code, stdout, stderr, spawnError: null });
    });
  });
}

const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true as const });

const AUTH_HINT = /not logged in|unauthorized|401|403|token|expired|login|authenticat/i;

const server = new McpServer({ name: "verify-with-kane", version: "1.0.0" });

server.registerTool(
  "verify_with_kane",
  {
    title: "Verify with Kane",
    description:
      "Verify a change by ACTUALLY DRIVING A REAL BROWSER against the running app, using Kane AI. " +
      "Use this instead of claiming a UI change works: it clicks, reloads, and asserts in headless Chrome, " +
      "and returns a real pass/fail verdict with the literal assertion that broke.\n\n" +
      "Two modes — supply EXACTLY ONE:\n" +
      "  • objective: plain English, e.g. \"Open http://localhost:5173, toggle dark mode, reload, and assert the background is still dark\".\n" +
      "  • testmd_path: an existing Kane test file (see list_kane_flows) — cached, cheap, deterministic. Prefer this when a flow already covers the change.\n\n" +
      "Costs real credits on first authoring; cached replays are ~30s and free. " +
      "A 'failed' status means the APP is broken — act on `reason`, which carries the literal failed assertion.",
    inputSchema: {
      objective: z
        .string()
        .min(8)
        .optional()
        .describe("Plain-English objective for an ad-hoc run. One outcome per objective; state the assertion plainly."),
      testmd_path: z
        .string()
        .optional()
        .describe("Path to a *_test.md Kane flow, absolute or relative to the project root."),
      url: z.string().url().optional().describe("Starting URL. Overrides the flow's frontmatter url."),
      timeout: z.number().int().min(30).max(900).default(180).describe("Per-run timeout in seconds."),
    },
    outputSchema: {
      status: z.enum(["passed", "failed", "error", "timeout"]).describe("passed = the browser proved it. error/timeout = UNVERIFIED, never a pass."),
      summary: z.string(),
      one_liner: z.string(),
      reason: z.string().describe("On failure, the literal failed assertion — this is what to act on."),
      credits: z.number().describe("Sum of credits_consumed across steps. 0 for a fully cached replay."),
      duration: z.number().nullable(),
      run_dir: z.string(),
      test_url: z.string(),
      evidence: z.record(z.string(), z.unknown()).describe("Session id, evidence pack id, screenshot path, step counts."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ objective, testmd_path, url, timeout }) => {
    if ((objective === undefined) === (testmd_path === undefined)) {
      return fail("Supply exactly one of `objective` or `testmd_path` — not both, not neither.");
    }

    let args: string[];
    if (testmd_path !== undefined) {
      const abs = isAbsolute(testmd_path) ? testmd_path : join(PROJECT_ROOT, testmd_path);
      if (!existsSync(abs)) return fail(`No such test file: ${abs}. Call list_kane_flows to see available flows.`);
      args = ["testmd", "run", abs];
    } else {
      args = ["run", objective as string];
    }
    args.push("--agent", "--headless", "--timeout", String(timeout));
    if (url !== undefined) args.push("--url", url);

    const out = await runKane(args, timeout);

    if (out.spawnError === "ENOENT") {
      return fail(
        `\`${KANE_BIN}\` is not on PATH, so nothing was verified. Install the Kane CLI and run ` +
          "`kane-cli login --oauth`, or set KANE_CLI_BIN to its full path. Do NOT report this change as verified."
      );
    }
    if (out.spawnError !== null) return fail(`Could not start ${KANE_BIN}: ${out.spawnError}`);

    const verdict: KaneVerdict = parseKaneNdjson(out.stdout, out.code);
    const stderrTail = out.stderr.trim().split("\n").slice(-4).join("\n");
    if (verdict.status !== "passed" && verdict.status !== "failed" && AUTH_HINT.test(out.stderr)) {
      verdict.reason += ` — this looks like an auth problem, not an app bug. Run \`kane-cli login --oauth\`. stderr: ${stderrTail}`;
    } else if (verdict.status === "error" && stderrTail !== "") {
      verdict.reason += ` stderr: ${stderrTail}`;
    }

    const headline =
      verdict.status === "passed"
        ? `KANE VERIFIED (passed) — a real browser confirmed this.`
        : `KANE ${verdict.status.toUpperCase()} — this is NOT verified.`;
    return {
      content: [{ type: "text" as const, text: `${headline}\n${verdict.reason}\n\n${JSON.stringify(verdict, null, 2)}` }],
      structuredContent: verdict as unknown as Record<string, unknown>,
    };
  }
);

server.registerTool(
  "list_kane_flows",
  {
    title: "List Kane flows",
    description:
      "List the Kane test flows (`tests/*_test.md`) this project already has, with each flow's title, " +
      "step headings, and frontmatter. Call this FIRST — replaying an existing flow is cached, fast and free, " +
      "whereas an ad-hoc `objective` has to be authored from cold and costs credits.",
    inputSchema: {
      dir: z.string().optional().describe("Directory to scan. Defaults to `tests/` under the project root."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ dir }) => {
    // `dir` arrives from whatever agent is driving this server, so it is
    // untrusted input. Without this it would happily enumerate any directory on
    // the machine that happens to contain *_test.md files.
    const base = resolve(
      dir === undefined ? join(PROJECT_ROOT, "tests") : isAbsolute(dir) ? dir : join(PROJECT_ROOT, dir),
    );
    if (base !== PROJECT_ROOT && !base.startsWith(PROJECT_ROOT + sep)) {
      return fail("dir must be inside the project root.");
    }
    if (!existsSync(base)) return fail(`No such directory: ${base}`);

    const flows = readdirSync(base)
      .filter((f) => f.endsWith("_test.md"))
      .sort()
      .map((file) => {
        const lines = readFileSync(join(base, file), "utf8").split("\n");
        return {
          file,
          path: join(base, file),
          title: lines.find((l) => l.startsWith("# "))?.slice(2).trim() ?? "",
          url: lines.find((l) => l.startsWith("url:"))?.slice(4).trim() ?? "",
          steps: lines.filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim()),
        };
      });

    const text =
      flows.length === 0
        ? `No *_test.md flows in ${base}. An empty suite is NOT a pass — use \`objective\` instead, or author a flow.`
        : flows
            .map((f) => `${f.path}\n  "${f.title}"${f.url ? ` @ ${f.url}` : ""}\n${f.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`)
            .join("\n\n");
    return { content: [{ type: "text" as const, text }] };
  }
);

await server.connect(new StdioServerTransport());
