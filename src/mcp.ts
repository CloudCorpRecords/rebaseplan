/**
 * rebaseplan MCP server. Tools: plan_rebase.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The planning is pure and local: no upstream API, no
 * authentication, no configuration, and no repository is
 * touched — the tool only plans a rebase.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { formatPayload, planRebase, VERSION } from "./rebaseplan.js";

const TOOLS = [
  {
    name: "plan_rebase",
    description:
      "Plan a safe rebase before you start: count merge commits and squash-merge markers in the branch history, weigh the upstream distance and whether the branch is published, and return a strategy, steps, and warnings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        commits: {
          type: "array",
          description: "The branch's own commits, oldest first: {hash, subject, merge}",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              hash: { type: "string", description: "Commit hash" },
              subject: { type: "string", description: "Commit subject" },
              merge: {
                type: "boolean",
                description: "True when the commit is a merge commit (optional, default false)",
              },
            },
            required: ["hash", "subject"],
          },
        },
        upstream_commits: {
          type: "array",
          description:
            "Commits the upstream branch has that this branch does not (optional): {hash, subject}",
          items: {
            type: "object",
            properties: {
              hash: { type: "string", description: "Commit hash" },
              subject: { type: "string", description: "Commit subject" },
            },
            required: ["hash", "subject"],
          },
        },
        published: {
          type: "boolean",
          description: "Whether the branch has been pushed or shared (optional)",
        },
      },
      required: ["commits"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "rebaseplan", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "plan_rebase") {
      out = planRebase(args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
