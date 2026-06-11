import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function findOwnPackageVersion(startDir: string): string | undefined {
  let dir = startDir;
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      // Name check so a fallback walk from cwd can't pick up an unrelated package.
      if (pkg.name === "bitbucket-mcp-server") return pkg.version;
    } catch {
      // No package.json at this level (or unreadable) — keep walking up.
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// Under vitest's happy-dom environment import.meta.url is not a file: URL,
// so fall back to cwd there (tests run from the repo root).
const moduleDir = import.meta.url.startsWith("file:")
  ? dirname(fileURLToPath(import.meta.url))
  : process.cwd();

export const PACKAGE_VERSION = findOwnPackageVersion(moduleDir) ?? "0.0.0";
