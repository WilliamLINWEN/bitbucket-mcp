import { Command } from "commander";
import { buildRepoCommand } from "./commands/repo.js";
import { buildPrCommand } from "./commands/pr.js";
import { buildPipelineCommand } from "./commands/pipeline.js";
import { buildCommitCommand } from "./commands/commit.js";
import { buildBranchCommand } from "./commands/branch.js";
import { buildIssueCommand } from "./commands/issue.js";
import { buildSearchCommand } from "./commands/search.js";
import { buildAuthCommand } from "./commands/auth.js";

export interface BbGlobals {
  readonly json: boolean;
  readonly pretty: boolean;
  readonly workspace: string | undefined;
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("bb")
    .description("Bitbucket CLI — terminal access to the same tools exposed via MCP")
    .version("2.0.0")
    .option("--json", "output machine-readable JSON instead of human text", false)
    .option("--pretty", "pretty-print JSON output (default is compact for piping)", false)
    .option("--workspace <slug>", "Bitbucket workspace; falls back to BITBUCKET_WORKSPACE")
    .showHelpAfterError();

  // Getter object: each subcommand reads `globals.json` at action time, after parse.
  // Don't pre-resolve `program.opts()` here — the values are not populated until
  // parseAsync runs.
  const globals: BbGlobals = {
    get json() { return !!program.opts().json; },
    get pretty() { return !!program.opts().pretty; },
    get workspace() { return program.opts().workspace as string | undefined; },
  };

  program.addCommand(buildRepoCommand(globals));
  program.addCommand(buildPrCommand(globals));
  program.addCommand(buildPipelineCommand(globals));
  program.addCommand(buildCommitCommand(globals));
  program.addCommand(buildBranchCommand(globals));
  program.addCommand(buildIssueCommand(globals));
  program.addCommand(buildSearchCommand(globals));
  program.addCommand(buildAuthCommand(globals));

  return program;
}
