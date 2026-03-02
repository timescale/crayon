/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  serverExternalPackages: ["@dbos-inc/dbos-sdk", "runcrayon"],
  // Allow Turbopack to follow symlinks outside the project root (e.g. runcrayon
  // symlinked from the global npm install in Docker cloud dev machines).
  turbopack: {
    root: "/",
  },
};

export default config;
