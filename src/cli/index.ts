#!/usr/bin/env node
import { buildProgram } from "./program.js";
import { reportAndExit } from "./errors.js";

async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    reportAndExit(error);
  }
}

void main();
