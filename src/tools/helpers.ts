import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type ToolHandler = (args: any) => unknown | Promise<unknown>;

export function makeRegister(server: McpServer) {
  return (
    name: string,
    description: string,
    inputSchema: Record<string, z.ZodTypeAny>,
    cb: ToolHandler,
  ) => server.registerTool(name, { description, inputSchema }, cb as any);
}
