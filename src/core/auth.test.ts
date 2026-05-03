import { describe, it, expect, afterEach } from "vitest";
import {
  EnvAuthProvider,
  StaticAuthProvider,
  hasAnyEnvCred,
  type AuthProvider,
} from "./auth.js";

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function clearAuthEnv() {
  delete process.env.BITBUCKET_USERNAME;
  delete process.env.BITBUCKET_APP_PASSWORD;
  delete process.env.BITBUCKET_API_TOKEN;
}

describe("StaticAuthProvider — captures credentials, never reads env", () => {
  it("username + apiToken → Basic base64(username:apiToken)", async () => {
    clearAuthEnv();
    const p: AuthProvider = new StaticAuthProvider({ username: "alice", apiToken: "tok" });
    const header = await p.getAuthHeader();
    expect(header).toBe("Basic " + Buffer.from("alice:tok").toString("base64"));
  });

  it("apiToken alone → Bearer apiToken", async () => {
    clearAuthEnv();
    const p = new StaticAuthProvider({ apiToken: "tok" });
    expect(await p.getAuthHeader()).toBe("Bearer tok");
  });

  it("username + appPassword → Basic base64(username:appPassword)", async () => {
    clearAuthEnv();
    const p = new StaticAuthProvider({ username: "alice", appPassword: "pw" });
    expect(await p.getAuthHeader()).toBe(
      "Basic " + Buffer.from("alice:pw").toString("base64"),
    );
  });

  it("no credentials → null", async () => {
    clearAuthEnv();
    const p = new StaticAuthProvider({});
    expect(await p.getAuthHeader()).toBeNull();
  });

  it("does not read process.env even when env is set", async () => {
    process.env.BITBUCKET_API_TOKEN = "from-env";
    const p = new StaticAuthProvider({}); // captured nothing
    expect(await p.getAuthHeader()).toBeNull();
  });
});

describe("EnvAuthProvider — reads env at call time, matches existing precedence", () => {
  it("username + apiToken → Basic base64(username:apiToken)", async () => {
    clearAuthEnv();
    process.env.BITBUCKET_USERNAME = "alice";
    process.env.BITBUCKET_API_TOKEN = "tok";
    const p = new EnvAuthProvider();
    expect(await p.getAuthHeader()).toBe(
      "Basic " + Buffer.from("alice:tok").toString("base64"),
    );
  });

  it("apiToken alone → Bearer apiToken", async () => {
    clearAuthEnv();
    process.env.BITBUCKET_API_TOKEN = "tok";
    const p = new EnvAuthProvider();
    expect(await p.getAuthHeader()).toBe("Bearer tok");
  });

  it("username + appPassword → Basic base64(username:appPassword)", async () => {
    clearAuthEnv();
    process.env.BITBUCKET_USERNAME = "alice";
    process.env.BITBUCKET_APP_PASSWORD = "pw";
    const p = new EnvAuthProvider();
    expect(await p.getAuthHeader()).toBe(
      "Basic " + Buffer.from("alice:pw").toString("base64"),
    );
  });

  it("no credentials → null", async () => {
    clearAuthEnv();
    const p = new EnvAuthProvider();
    expect(await p.getAuthHeader()).toBeNull();
  });
});

describe("hasAnyEnvCred — env precedence predicate", () => {
  it("returns false when no auth env vars are set", () => {
    clearAuthEnv();
    expect(hasAnyEnvCred()).toBe(false);
  });

  it("returns true when only BITBUCKET_API_TOKEN is set", () => {
    clearAuthEnv();
    process.env.BITBUCKET_API_TOKEN = "tok";
    expect(hasAnyEnvCred()).toBe(true);
  });

  it("returns true when BITBUCKET_USERNAME + BITBUCKET_APP_PASSWORD are both set", () => {
    clearAuthEnv();
    process.env.BITBUCKET_USERNAME = "alice";
    process.env.BITBUCKET_APP_PASSWORD = "pw";
    expect(hasAnyEnvCred()).toBe(true);
  });

  it("returns true when BITBUCKET_USERNAME + BITBUCKET_API_TOKEN are both set", () => {
    clearAuthEnv();
    process.env.BITBUCKET_USERNAME = "alice";
    process.env.BITBUCKET_API_TOKEN = "tok";
    expect(hasAnyEnvCred()).toBe(true);
  });

  it("returns false when only BITBUCKET_USERNAME is set (no token, no password)", () => {
    clearAuthEnv();
    process.env.BITBUCKET_USERNAME = "alice";
    expect(hasAnyEnvCred()).toBe(false);
  });

  it("returns false when only BITBUCKET_APP_PASSWORD is set (no username)", () => {
    clearAuthEnv();
    process.env.BITBUCKET_APP_PASSWORD = "pw";
    expect(hasAnyEnvCred()).toBe(false);
  });
});
