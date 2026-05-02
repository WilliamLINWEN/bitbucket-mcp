import { recordError } from "../error-context.js";

export class CliError extends Error {
  constructor(message: string, public readonly exitCode: number = 1) {
    super(message);
    this.name = "CliError";
  }
}

export interface ClassifiedError {
  message: string;
  exitCode: number;
}

export const AUTH_HINT =
  "Hint: Set BITBUCKET_API_TOKEN (Bearer) or BITBUCKET_USERNAME + BITBUCKET_API_TOKEN (Basic). Generate at https://bitbucket.org/account/settings/api-tokens/. App passwords are deprecated by Atlassian but BITBUCKET_USERNAME + BITBUCKET_APP_PASSWORD still works.";

/**
 * Classify an unknown thrown value into a structured error with an exit code.
 *
 * Exit code scheme:
 *   0 — success (caller's responsibility; this function never returns 0)
 *   1 — caller error (validation, missing or invalid arguments)
 *   2 — upstream Bitbucket HTTP errors (4xx/5xx including auth failures)
 *   3 — unknown / unrecognised error
 *
 * 401/403 responses additionally include AUTH_HINT in the message so that
 * LLM consumers know which environment variable to set without parsing --help.
 */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof CliError) return { message: error.message, exitCode: error.exitCode };
  const msg = error instanceof Error ? error.message : String(error);
  if (/\b(401|403)\b/.test(msg)) return { message: `${msg}\n${AUTH_HINT}`, exitCode: 2 };
  if (/\b(404|409|429|5\d\d)\b/.test(msg)) return { message: msg, exitCode: 2 };
  if (/workspace|repository|required|invalid/i.test(msg)) return { message: msg, exitCode: 1 };
  return { message: msg, exitCode: 3 };
}

export function reportAndExit(error: unknown): never {
  const c = classifyError(error);
  if (error instanceof Error) {
    recordError(error, "bb-cli", "bb-cli");
  }
  process.stderr.write(`error: ${c.message}\n`);
  process.exit(c.exitCode);
}
