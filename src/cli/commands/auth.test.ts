import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildAuthCommand } from "./auth.js";
import * as systemCore from "../../core/system.js";

describe("cli auth command", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stdoutSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("`auth status` calls core and prints structured result", async () => {
    vi.spyOn(systemCore, "authStatus").mockResolvedValue({
      authenticated: true,
      authMethod: "token",
      workspaceTested: "acme",
      reachable: true,
    });
    const cmd = buildAuthCommand({ json: true });
    await cmd.parseAsync(["status"], { from: "user" });
    expect(systemCore.authStatus).toHaveBeenCalled();
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(JSON.parse(out)).toMatchObject({
      authMethod: "token",
      workspaceTested: "acme",
      reachable: true,
    });
  });

  it("`auth login` prints token-setup instructions in human mode", async () => {
    const cmd = buildAuthCommand({ json: false });
    await cmd.parseAsync(["login"], { from: "user" });
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).toContain("BITBUCKET_API_TOKEN");
    expect(out).toContain("api-tokens");
  });

  it("`auth logout` prints unset instructions", async () => {
    const cmd = buildAuthCommand({ json: false });
    await cmd.parseAsync(["logout"], { from: "user" });
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).toContain("unset BITBUCKET_API_TOKEN");
  });
});
