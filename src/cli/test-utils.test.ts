import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";
import { expectCliRejection } from "./test-utils.js";
import { CliError } from "./errors.js";
import { action } from "./action.js";
import { propagateExitOverride } from "./utils.js";

function buildThrowingCmd(message: string): Command {
  const cmd = new Command("root");
  cmd.command("boom").action(action(async () => {
    throw new CliError(message);
  }));
  propagateExitOverride(cmd);
  return cmd;
}

describe("expectCliRejection", () => {
  it("matches stderrIncludes substring and resolves on rejection", async () => {
    const cmd = buildThrowingCmd("kaboom: bad input");
    await expectCliRejection(cmd, {
      argv: ["boom"],
      stderrIncludes: "bad input",
    });
  });

  it("matches stderrMatches regex", async () => {
    const cmd = buildThrowingCmd("kaboom: bad input value=42");
    await expectCliRejection(cmd, {
      argv: ["boom"],
      stderrMatches: /value=\d+/,
    });
  });

  it("defaults to exit code 1", async () => {
    const cmd = buildThrowingCmd("kaboom");
    // No exitCode option → must succeed for code 1
    await expectCliRejection(cmd, { argv: ["boom"], stderrIncludes: "kaboom" });
  });

  it("restores process.exit and process.stderr.write spies on success", async () => {
    const cmd = buildThrowingCmd("kaboom");
    const originalExit = process.exit;
    const originalStderrWrite = process.stderr.write;
    await expectCliRejection(cmd, { argv: ["boom"], stderrIncludes: "kaboom" });
    expect(process.exit).toBe(originalExit);
    expect(process.stderr.write).toBe(originalStderrWrite);
  });

  it("restores spies even when an inner expectation fails", async () => {
    const cmd = buildThrowingCmd("kaboom");
    const originalExit = process.exit;
    const originalStderrWrite = process.stderr.write;
    await expect(
      expectCliRejection(cmd, { argv: ["boom"], stderrIncludes: "DOES NOT APPEAR" }),
    ).rejects.toThrow();
    expect(process.exit).toBe(originalExit);
    expect(process.stderr.write).toBe(originalStderrWrite);
  });
});
