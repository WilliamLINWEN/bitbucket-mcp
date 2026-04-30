import { Command } from "commander";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("bb")
    .description("Bitbucket CLI — terminal access to the same tools exposed via MCP")
    .version("2.0.0")
    .option("--json", "output machine-readable JSON instead of human text", false)
    .option("--workspace <slug>", "Bitbucket workspace; falls back to BITBUCKET_WORKSPACE")
    .showHelpAfterError();

  // Subcommands are attached in subsequent tasks via program.addCommand(...).

  return program;
}
