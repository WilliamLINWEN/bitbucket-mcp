import { reportAndExit } from "./errors.js";

export function action<T extends any[]>(fn: (...args: T) => Promise<void>) {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error) {
      reportAndExit(error);
    }
  };
}
