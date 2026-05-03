import { expect, vi } from "vitest";
import type { Command } from "commander";

export interface ExpectCliRejectionOpts {
  argv: string[];
  stderrIncludes?: string;
  stderrMatches?: RegExp;
  /** Expected `process.exit` code; defaults to 1 (caller error). */
  exitCode?: number;
}

/**
 * Drive a commander `Command` through `parseAsync` and assert it rejects with a
 * specific exit code, optionally matching the captured stderr.
 *
 * Replaces the 6+ line `vi.spyOn(process, "exit") + vi.spyOn(process.stderr, "write")
 * + try/finally` boilerplate that accumulated across CLI command tests in rounds 1–2.
 *
 * Usage:
 * ```ts
 * const cmd = buildPrCommand({ json: true, pretty: false });
 * await expectCliRejection(cmd, {
 *   argv: ["comment", "create", "7", "-r", "r1", "-m", "x", "--file", "foo.ts"],
 *   stderrIncludes: "--file requires both --from and --to",
 * });
 * ```
 *
 * Mechanism: action-thrown CliErrors flow through `reportAndExit` in `errors.ts`,
 * which calls `process.exit` directly — so the `process.exit` spy is the load-bearing
 * piece for those cases. `cmd.exitOverride()` is what catches commander-level
 * rejections (missing required option, unknown flag) which otherwise also call
 * `process.exit`. Both paths get caught; spies are always restored.
 */
export async function expectCliRejection(
  cmd: Command,
  opts: ExpectCliRejectionOpts,
): Promise<void> {
  const exitCode = opts.exitCode ?? 1;
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
    throw new Error(`__exit:${code ?? 0}`);
  }) as unknown as ReturnType<typeof vi.spyOn>;
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  try {
    cmd.exitOverride();
    await expect(cmd.parseAsync(opts.argv, { from: "user" })).rejects.toThrow(
      `__exit:${exitCode}`,
    );
    const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    if (opts.stderrIncludes !== undefined) {
      expect(stderr).toContain(opts.stderrIncludes);
    }
    if (opts.stderrMatches !== undefined) {
      expect(stderr).toMatch(opts.stderrMatches);
    }
  } finally {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}
