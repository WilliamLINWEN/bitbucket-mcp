import { describe, it, expect, vi } from "vitest";
import { buildProgram } from "./program.js";
import { AUTH_HINT } from "./errors.js";

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

  it("--help output includes exit codes block and auth hint", async () => {
    const program = buildProgram();
    program.exitOverride();

    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    try {
      await program.parseAsync(["node", "bb", "--help"]);
    } catch {
      // exitOverride throws on --help; ignore the throw
    } finally {
      spy.mockRestore();
    }

    const output = chunks.join("");
    expect(output).toContain("Exit codes:");
    expect(output).toContain("0  Success");
    expect(output).toContain("Auth:");
    expect(output).toContain(AUTH_HINT);
  });
});
