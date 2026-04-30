import { describe, it, expect } from "vitest";
import { buildProgram } from "./program.js";

describe("cli/program buildProgram", () => {
  it("registers a `bb` program with --json and --workspace globals", () => {
    const program = buildProgram();
    expect(program.name()).toBe("bb");
    const optionNames = program.options.map((o) => o.long);
    expect(optionNames).toContain("--json");
    expect(optionNames).toContain("--workspace");
  });

  it("exits with 0 on --help", async () => {
    const program = buildProgram();
    program.exitOverride();
    let exitCode: number | undefined;
    try {
      // No `from: "user"` here — pass the full process.argv shape.
      await program.parseAsync(["node", "bb", "--help"]);
    } catch (err: any) {
      exitCode = err.exitCode;
    }
    expect(exitCode).toBe(0);
  });
});
