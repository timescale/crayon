// packages/core/src/nodes/builtin/index.ts
import { httpGet } from "./http.js";
import type { Executable } from "../../types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExecutable = Executable<any, any>;

/**
 * All built-in nodes indexed by name
 */
export const builtinNodes: Record<string, AnyExecutable> = {
  "http_get": httpGet,
};

export { httpGet };
