import { Command } from "commander";
import { CliError } from "./errors.js";

/**
 * Propagate `cmd.exitOverride()` to every nested subcommand.
 *
 * Why: commander copies `_exitCallback` from parent to child only at
 * subcommand-creation time. Calling `cmd.exitOverride()` after the
 * subcommands are attached does not reach them. Tests that build a command
 * and then call `cmd.exitOverride()` (so commander-level errors throw rather
 * than calling `process.exit`) need the override to cascade.
 */
export function propagateExitOverride(cmd: Command): void {
  const original = cmd.exitOverride.bind(cmd);
  cmd.exitOverride = function (fn?: (err: any) => never) {
    original(fn as any);
    const applyToAll = (parent: Command) => {
      for (const sub of parent.commands) {
        if (fn) sub.exitOverride(fn);
        else sub.exitOverride();
        applyToAll(sub);
      }
    };
    applyToAll(cmd);
    return cmd;
  };
}

/** Parse an integer command-line option, throwing CliError on NaN. */
export function parseIntOpt(value: string): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) throw new CliError(`expected integer, got: ${value}`);
  return n;
}

/** Parse a positional integer argument, throwing CliError on NaN. */
export function parseIntStrict(value: string, label: string): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) throw new CliError(`${label} must be an integer, got: ${value}`);
  return n;
}
