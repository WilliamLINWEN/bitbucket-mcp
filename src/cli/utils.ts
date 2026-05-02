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

/** Parse an integer command-line option, throwing CliError on NaN or mixed content. */
export function parseIntOpt(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new CliError(`expected integer, got: ${value}`);
  const n = Number.parseInt(value, 10);
  if (n <= 0) throw new CliError(`expected positive integer, got: ${value}`);
  return n;
}

/** Parse a positional integer argument, throwing CliError on NaN or mixed content. */
export function parseIntStrict(value: string, label: string): number {
  if (!/^-?\d+$/.test(value)) throw new CliError(`${label} must be an integer, got: ${value}`);
  const n = Number.parseInt(value, 10);
  if (n <= 0) throw new CliError(`${label} must be a positive integer, got: ${value}`);
  return n;
}

/** Parse a non-negative integer; allows 0 (used for sentinel "unlimited" semantics in --tail/--head etc.). */
export function parseNonNegativeIntOpt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new CliError(`expected non-negative integer (e.g., '0' or '500'), got: '${value}'`);
  }
  return Number.parseInt(value, 10);
}

/** Parse a pagelen value, throwing CliError if outside Bitbucket's documented 10-100 range. */
export function parsePagelenOpt(value: string): number {
  const n = parseIntOpt(value);
  if (n < 10 || n > 100) {
    throw new CliError(`--pagelen must be between 10 and 100; got: ${value}`);
  }
  return n;
}
