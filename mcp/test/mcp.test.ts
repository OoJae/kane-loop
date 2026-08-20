/**
 * Proves the server really speaks MCP: a genuine SDK client performs the
 * initialize handshake over stdio, lists tools, and exercises the two paths
 * that return BEFORE kane-cli is ever spawned (so this costs zero credits).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MCP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(MCP_DIR, "..");

const transport = new StdioClientTransport({
  command: join(MCP_DIR, "node_modules", ".bin", "tsx"),
  args: [join(MCP_DIR, "src", "server.ts")],
  env: { ...(process.env as Record<string, string>), KANE_PROJECT_DIR: ROOT },
});

const client = new Client({ name: "kane-loop-probe", version: "1.0.0" });
await client.connect(transport);
console.log("=== initialize OK ===");
console.log(JSON.stringify(client.getServerVersion(), null, 2));

console.log("\n=== tools/list ===");
const tools = await client.listTools();
console.log(JSON.stringify(tools, null, 2));

console.log("\n=== tools/call list_kane_flows ===");
console.log(JSON.stringify(await client.callTool({ name: "list_kane_flows", arguments: {} }), null, 2));

console.log("\n=== tools/call verify_with_kane {} — XOR guard, no kane-cli spawned ===");
console.log(JSON.stringify(await client.callTool({ name: "verify_with_kane", arguments: {} }), null, 2));

console.log("\n=== tools/call verify_with_kane {objective, testmd_path} — both supplied ===");
console.log(
  JSON.stringify(
    await client.callTool({
      name: "verify_with_kane",
      arguments: { objective: "toggle dark mode and reload", testmd_path: "tests/darkmode_test.md" },
    }),
    null,
    2
  )
);

console.log("\n=== tools/call verify_with_kane {testmd_path: missing file} ===");
console.log(
  JSON.stringify(await client.callTool({ name: "verify_with_kane", arguments: { testmd_path: "tests/nope_test.md" } }), null, 2)
);

await client.close();
console.log("\nMCP HANDSHAKE + TOOL SURFACE VERIFIED");
