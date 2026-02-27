import { version } from "./config.js";
import type { ServerContext } from "./types.js";

export const serverInfo = {
  name: "crayon-local-tools",
  version,
} as const;

export const context: ServerContext = {};
