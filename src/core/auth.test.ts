import { describe, it, expect, afterEach } from "vitest";
import {
  EnvAuthProvider,
  StaticAuthProvider,
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
