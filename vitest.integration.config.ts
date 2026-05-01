import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Integration tests spawn the built `bb` binary as a subprocess and hit the real
// Bitbucket API. They are excluded from the default `npm test` run because they
// are network-bound and slower. Run via `npm run test:integration`.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules", "build"],
    testTimeout: 30_000, // generous timeout for network calls
    hookTimeout: 30_000,
  },
  esbuild: {
    target: "node18",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
