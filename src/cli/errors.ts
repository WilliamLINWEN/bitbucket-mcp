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

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof CliError) return { message: error.message, exitCode: error.exitCode };
  const msg = error instanceof Error ? error.message : String(error);
  if (/\b(401|403|404|409|429|5\d\d)\b/.test(msg)) return { message: msg, exitCode: 2 };
  if (/workspace|repository|required|invalid/i.test(msg)) return { message: msg, exitCode: 1 };
  return { message: msg, exitCode: 3 };
}

export function reportAndExit(error: unknown): never {
  const c = classifyError(error);
  process.stderr.write(`error: ${c.message}\n`);
  process.exit(c.exitCode);
}
